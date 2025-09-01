import path from "path";
import { buildLog, cleanDir, pathExists, PROJECT_ROOT } from "./utils.mjs";
import { promises as fs } from "fs";
import { build } from "esbuild";

// -----------------------------------------------------------------------------
// Detecta packages (carpetas en packages/ con package.json)
// -----------------------------------------------------------------------------
// Busca paquetes en:
//   - packages/<pkg>/package.json
//   - packages/@<scope>/<pkg>/package.json
async function findInternalPackages() {
	const libsFolder = path.join(PROJECT_ROOT, "packages");
	if (!(await pathExists(libsFolder))) return [];

	const libs = [];

	const top = await fs.readdir(libsFolder, { withFileTypes: true });
	for (const entry of top) {
		if (!entry.isDirectory()) continue;
		const full = path.join(libsFolder, entry.name);

		// Caso scope: packages/@trp/*
		if (entry.name.startsWith("@")) {
			let scoped;
			try {
				scoped = await fs.readdir(full, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const se of scoped) {
				if (!se.isDirectory()) continue;
				const pkgDir = path.join(full, se.name);
				if (await pathExists(path.join(pkgDir, "package.json"))) {
					libs.push(pkgDir);
				}
			}
			continue;
		}

		// Caso paquete directo: packages/foo
		if (await pathExists(path.join(full, "package.json"))) {
			libs.push(full);
		}
	}

	// salida estable y sin duplicados
	return [...new Set(libs)].sort((a, b) => a.localeCompare(b));
}

// Build de una librería (packages/*/src/index.ts → packages/*/dist/index.js)
export async function buildInternalPackage(libDir) {
	const name = path.basename(libDir);
	const outdir = path.join(libDir, "dist");

	await cleanDir(outdir);
	buildLog.step(`Cleaning dist folder for package ${name}`);

	const entry = path.join(libDir, "src/index.ts");
	if (!(await pathExists(entry))) {
		buildLog.step(`${name}: package not has src/index.ts`);
		return;
	}

	await build({
		entryPoints: [entry],
		outfile: path.join(outdir, "index.js"),
		platform: "node",
		format: "cjs",
		target: "node22",
		bundle: true,
		sourcemap: false,
		logLevel: "info",
		tsconfig: (await pathExists(path.join(libDir, "tsconfig.json")))
			? path.join(libDir, "tsconfig.json")
			: undefined,
	});

	buildLog.ok(`${name}: library compiled in dist/`);
}

export const buildInternalPackages = async () => {
	const libs = await findInternalPackages();
	if (libs.length > 0) {
		buildLog.info(
			`Internal packages detected: ${libs.map((l) => path.basename(l)).join(", ")}`,
		);
		for (const lib of libs) {
			await buildInternalPackage(lib);
		}
	}
};
