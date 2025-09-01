import path from "path";
import {
	pathExists,
	PROJECT_ROOT,
	readJSON,
	cleanDir,
	buildLog,
} from "./utils.mjs";
import { promises as fs } from "fs";
import { glob } from "glob";
import { build } from "esbuild";
import { buildNUIs } from "./build-nui.mjs";

async function findModules(moduleName) {
	const modulesFolder = path.join(PROJECT_ROOT, "[modules]");
	if (!(await pathExists(modulesFolder))) return [];

	// If moduleName is provided, check only that module
	if (typeof moduleName === "string" && moduleName.length > 0) {
		const dir = path.join(modulesFolder, moduleName);
		const hasFx = await pathExists(path.join(dir, "fxmanifest.lua"));
		const hasPkg = await pathExists(path.join(dir, "package.json"));
		if (hasFx && hasPkg) return [dir];
		return [];
	}

	// Otherwise, look up all modules
	const entries = await fs.readdir(modulesFolder, { withFileTypes: true });
	const candidates = entries
		.filter((e) => e.isDirectory())
		.map((e) => path.join(modulesFolder, e.name));

	const modules = [];
	for (const dir of candidates) {
		const hasFx = await pathExists(path.join(dir, "fxmanifest.lua"));
		const hasPkg = await pathExists(path.join(dir, "package.json"));
		if (hasFx && hasPkg) modules.push(dir);
	}
	return modules;
}

async function getExternalDeps(modDir) {
	try {
		const pkg = await readJSON(path.join(modDir, "package.json"));
		const deps = Object.keys(pkg.dependencies || {});
		const peers = Object.keys(pkg.peerDependencies || {});
		const optionals = Object.keys(pkg.optionalDependencies || {});
		return Array.from(new Set([...deps, ...peers, ...optionals]));
	} catch {
		return [];
	}
}

async function getEntryPoints(modDir, context) {
	const dir = path.join(modDir, context);
	if (!(await pathExists(dir))) return [];
	const patterns = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
	const results = await Promise.all(
		patterns.map((p) =>
			glob(p, {
				cwd: dir,
				absolute: true,
				ignore: ["**/node_modules/**", "**/dist/**"],
				nodir: true,
			}),
		),
	);
	return [...new Set(results.flat())];
}

export const buildModule = (withWatch) => async (modDir) => {
	const name = path.basename(modDir);
	const outdir = path.join(modDir, "dist");
	const tsconfig = (await pathExists(path.join(modDir, "tsconfig.json")))
		? path.join(modDir, "tsconfig.json")
		: (await pathExists(path.join(PROJECT_ROOT, "tsconfig.json")))
			? path.join(PROJECT_ROOT, "tsconfig.json")
			: undefined;

	await cleanDir(outdir);
	buildLog.step(`Cleaning module output folder: ${name}`);

	console.log("module", modDir);

	const [serverEntries, clientEntries, sharedEntries] = await Promise.all([
		getEntryPoints(modDir, "server"),
		getEntryPoints(modDir, "client"),
		getEntryPoints(modDir, "shared"),
	]);

	const allEntries = [...serverEntries, ...clientEntries, ...sharedEntries];
	if (allEntries.length === 0) {
		buildLog.warn(`${name}: sin archivos (server/client/shared vacíos).`);
		return;
	}

	const external = await getExternalDeps(modDir);

	const common = {
		entryPoints: allEntries,
		outdir,
		outbase: modDir,
		platform: "node",
		format: "cjs",
		target: "node22",
		bundle: true,
		sourcemap: false,
		logLevel: "info",
		tsconfig,
		loader: { ".ts": "ts", ".tsx": "tsx" },
		external,
	};

	await buildNUIs(name, withWatch);

	if (withWatch) {
		buildLog.step(`${name}: watch activado`);
		const ctx = await build({
			...common,
			watch: {
				onRebuild(error) {
					if (error) buildLog.error(`Rebuild ${name} falló`);
					else buildLog.ok(`Rebuild ${name}: actualizado`);
				},
			},
		});
		return ctx;
	} else {
		await build(common);
		buildLog.ok(`${name}: módulo compilado en dist/`);
	}
};

export const buildModules = async (moduleName, withWatch) => {
	try {
		// 2. Luego compilar módulos
		const modules = await findModules(moduleName);
		if (modules.length === 0) {
			buildLog.error("No modules found (folders with fxmanifest.lua).");
			process.exit(0);
		}

		buildLog.info(
			`Modules detected: ${modules.map((m) => path.basename(m)).join(", ")}`,
		);
		await Promise.all(modules.map(buildModule(withWatch)));

		if (!withWatch) buildLog.ok("🎉 Build finished.");
	} catch (e) {
		buildLog.error(e?.stack || String(e));
		process.exit(1);
	}
};
