import { promises as fs } from "fs";
import path from "path";
import { build as viteBuild } from "vite";
import { buildLog, cleanDir, pathExists, PROJECT_ROOT } from "./utils.mjs";

// --- Available modules ----------------------------------------------------------------
async function findModules(moduleName) {
	const folder = path.join(PROJECT_ROOT, "[modules]");
	if (!(await pathExists(folder))) return [];
	const entries = await fs.readdir(folder, { withFileTypes: true });
	const dirs = entries
		.filter((e) => e.isDirectory())
		.map((e) => path.join(folder, e.name));

	const out = [];
	for (const dir of dirs) {
		if (moduleName && path.basename(dir) !== moduleName) continue;
		const hasFx = await pathExists(path.join(dir, "fxmanifest.lua"));
		const hasPkg = await pathExists(path.join(dir, "package.json"));
		if (hasFx && hasPkg) out.push(dir);
	}
	return out;
}

// --- NUI discovery ----------------------------------------------------------
/**
 * Find NUI in a module.
 * - <mod>/nui/index.html                   -> app "nui"
 */
async function findNuiApps(modDir) {
	const nuiRoot = path.join(modDir, "nui");
	if (!(await pathExists(nuiRoot))) return [];

	const apps = [];

	// Caso 1: /nui/index.html
	if (await pathExists(path.join(nuiRoot, "index.html"))) {
		apps.push({
			name: "nui",
			rootDir: nuiRoot,
			outDir: path.join(modDir, "dist", "nui"),
		});
	}

	const seen = new Set();
	return apps.filter((a) => {
		const key = `${a.name}:${a.rootDir}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function buildNuiApp(modName, app, withWatch) {
	// Always clean out dir
	await cleanDir(app.outDir);

	const configFile = path.join(PROJECT_ROOT, "vite.config.ts");
	const hasConfig = await pathExists(configFile);
	if (!hasConfig) {
		throw new Error(
			`No se encontró ${path.relative(PROJECT_ROOT, configFile)} (config común de Vite).`,
		);
	}

	const viteOpts = {
		configFile,
		root: app.rootDir,
		base: "./",
		mode: "production",
		logLevel: "info",
		build: {
			outDir: app.outDir,
			emptyOutDir: true,
			sourcemap: false,
			watch: withWatch ? {} : undefined,
		},
		envDir: PROJECT_ROOT,
	};

	if (withWatch) {
		buildLog.info(`[${modName}/${app.name}] watch activado`);
	}

	const result = await viteBuild(viteOpts);

	if (!withWatch) {
		buildLog.ok(
			`[${modName}/${app.name}] NUI compilado → ${path.relative(PROJECT_ROOT, app.outDir)}`,
		);
	}

	return result;
}

export const buildNUIs = async (moduleName, withWatch) => {
	try {
		const modules = await findModules(moduleName);
		if (modules.length === 0) {
			buildLog.error(
				"No se encontraron módulos (carpetas con fxmanifest.lua).",
			);
			process.exit(0);
		}

		buildLog.info(
			`Módulos detectados: ${modules.map((m) => path.basename(m)).join(", ")}`,
		);

		let totalApps = 0;
		for (const modDir of modules) {
			const modName = path.basename(modDir);
			const apps = await findNuiApps(modDir);
			if (apps.length === 0) {
				buildLog.step(
					`${modName}: sin NUI (no se encontró "nui/index.html" ni "nui/*/index.html").`,
				);
				continue;
			}

			for (const app of apps) {
				totalApps++;
				await buildNuiApp(modName, app);
			}
		}

		if (totalApps === 0) {
			buildLog.warn("No se encontraron NUI apps en ningún módulo.");
		} else if (!withWatch) {
			buildLog.ok("Build NUI finalizado.");
		}
	} catch (e) {
		buildLog.error(e?.stack || String(e));
		process.exit(1);
	}
};
