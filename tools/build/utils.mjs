import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.join(__dirname, "../../");

export async function pathExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

export async function readJSON(file) {
	const txt = await fs.readFile(file, "utf8");
	return JSON.parse(txt);
}

export async function cleanDir(dir) {
	await fs.rm(dir, { recursive: true, force: true });
}

const logColors = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",

	fg: {
		gray: "\x1b[90m",
		red: "\x1b[91m",
		green: "\x1b[92m",
		yellow: "\x1b[93m",
		blue: "\x1b[94m",
		magenta: "\x1b[95m",
		cyan: "\x1b[96m",
		white: "\x1b[97m",
	},
};

function colorize(msg, color) {
	return `${color}${msg}${logColors.reset}`;
}

export const buildLog = {
	info: (msg, ...args) =>
		console.log(colorize("ℹ️  " + msg, logColors.fg.cyan), ...args),
	ok: (msg, ...args) =>
		console.log(colorize("✅ " + msg, logColors.fg.green), ...args),
	warn: (msg, ...args) =>
		console.warn(colorize("⚠️  " + msg, logColors.fg.yellow), ...args),
	error: (msg, ...args) =>
		console.error(colorize("❌ " + msg, logColors.fg.red), ...args),
	step: (msg, ...args) =>
		console.log(colorize("▶ " + msg, logColors.fg.magenta), ...args),
	title: (msg, ...args) =>
		console.log(
			colorize(
				"━━━ " + msg.toUpperCase() + " ━━━",
				logColors.bold + logColors.fg.blue,
			),
			...args,
		),
};
