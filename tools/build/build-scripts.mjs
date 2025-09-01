// build-scripts.mjs
// Compila librerías (en [libs]) y módulos (en [modules]) en CJS para Node 22.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";
import { glob } from "glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Raíz del workspace (sube 2 niveles desde scripts/)
const ROOT = path.join(__dirname, "../../");

// --- Opciones CLI ------------------------------------------------------------
const args = new Set(process.argv.slice(2));
const WATCH = args.has("--watch");
const CLEAN = args.has("--clean");

// --- Utils -------------------------------------------------------------------
async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJSON(file) {
  const txt = await fs.readFile(file, "utf8");
  return JSON.parse(txt);
}

async function rmrf(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

function log(msg) {
  console.log(msg);
}
function err(msg) {
  console.error(msg);
}

// -----------------------------------------------------------------------------
// Detecta librerías (carpetas en packages/ con package.json)
// -----------------------------------------------------------------------------
// Busca paquetes en:
//   - packages/<pkg>/package.json
//   - packages/@<scope>/<pkg>/package.json
async function findLibraries() {
  const libsFolder = path.join(ROOT, "packages");
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

// Build de una librería (src/index.ts → dist/index.js)
async function buildLibrary(libDir) {
  const name = path.basename(libDir);
  const outdir = path.join(libDir, "dist");

  if (CLEAN) {
    await rmrf(outdir);
    log(`🧹 Limpio librería ${name}`);
  }

  const entry = path.join(libDir, "src/index.ts");
  if (!(await pathExists(entry))) {
    log(`⚪ ${name}: no tiene src/index.ts`);
    return;
  }

  await build({
    entryPoints: [entry],
    outfile: path.join(outdir, "index.js"),
    platform: "node",
    format: "cjs",
    target: "node22",
    bundle: true, // librerías sí se empaquetan
    sourcemap: false,
    logLevel: "info",
    tsconfig: (await pathExists(path.join(libDir, "tsconfig.json")))
      ? path.join(libDir, "tsconfig.json")
      : undefined,
  });

  log(`✅ ${name}: librería compilada en dist/`);
}

// -----------------------------------------------------------------------------
// Detecta módulos (carpetas en [modules] con fxmanifest.lua y package.json)
// -----------------------------------------------------------------------------
async function findModules() {
  const modulesFolder = path.join(ROOT, "[modules]");
  if (!(await pathExists(modulesFolder))) return [];
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

// Lee deps para marcarlas como external
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

// Busca entrypoints de un módulo
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
      })
    )
  );
  return [...new Set(results.flat())];
}

// Compila un módulo completo
async function buildModule(modDir) {
  const name = path.basename(modDir);
  const outdir = path.join(modDir, "dist");
  const tsconfig = (await pathExists(path.join(modDir, "tsconfig.json")))
    ? path.join(modDir, "tsconfig.json")
    : (await pathExists(path.join(ROOT, "tsconfig.json")))
    ? path.join(ROOT, "tsconfig.json")
    : undefined;

  if (CLEAN) {
    await rmrf(outdir);
    log(`🧹 Limpio módulo ${name}`);
  }

  const [serverEntries, clientEntries, sharedEntries] = await Promise.all([
    getEntryPoints(modDir, "server"),
    getEntryPoints(modDir, "client"),
    getEntryPoints(modDir, "shared"),
  ]);

  const allEntries = [...serverEntries, ...clientEntries, ...sharedEntries];
  if (allEntries.length === 0) {
    log(`⚪ ${name}: sin archivos (server/client/shared vacíos).`);
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
    external, // deja require("mylib") en el resultado
  };

  if (WATCH) {
    log(`👀 ${name}: watch activado`);
    const ctx = await build({
      ...common,
      watch: {
        onRebuild(error) {
          if (error) err(`❌ Rebuild ${name} falló`);
          else log(`✅ Rebuild ${name}: actualizado`);
        },
      },
    });
    return ctx;
  } else {
    await build(common);
    log(`✅ ${name}: módulo compilado en dist/`);
  }
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------
(async function main() {
  try {
    // 1. Compilar librerías primero
    const libs = await findLibraries();
    if (libs.length > 0) {
      log(`📚 Librerías detectadas: ${libs.map((l) => path.basename(l)).join(", ")}`);
      for (const lib of libs) {
        await buildLibrary(lib);
      }
    }

    // 2. Luego compilar módulos
    const modules = await findModules();
    if (modules.length === 0) {
      log("No se encontraron módulos (carpetas con fxmanifest.lua).");
      process.exit(0);
    }

    log(`📦 Módulos detectados: ${modules.map((m) => path.basename(m)).join(", ")}`);
    await Promise.all(modules.map(buildModule));

    if (!WATCH) log("🎉 Build finalizado.");
  } catch (e) {
    err(e?.stack || String(e));
    process.exit(1);
  }
})();
