import { buildInternalPackages } from "./build-packages.mjs";
import { buildModules } from "./build-modules.mjs";

const args = new Set(process.argv.slice(4));
const WATCH = args.has("--watch");
const CLEAN = args.has("--clean");
const ONLY_MODULE =
	[...args].find((a) => a.startsWith("--module="))?.split("=")[1] ?? null;

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------
(async function main() {
	console.log(WATCH, CLEAN, ONLY_MODULE);
	await buildInternalPackages();
	await buildModules();
})();
