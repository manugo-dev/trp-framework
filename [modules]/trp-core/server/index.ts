import { DateWrapper } from "@trp/date";
import { getMySqlConfig } from "@trp/config";
import { dbFor, eq, getPool } from "@trp/db";
import schema from "./schema"; // el default export del archivo de arriba

const cfg = getMySqlConfig();
const pool = getPool({
	MYSQL_HOST: cfg.host,
	MYSQL_PORT: cfg.port,
	MYSQL_DATABASE: cfg.database,
	MYSQL_USER: cfg.user,
	MYSQL_PASSWORD: cfg.password,
	MYSQL_POOL_LIMIT: cfg.poolLimit,
});
const db = dbFor(schema);

on("onResourceStart", (resourceName: string) => {
	console.log("Resource started:", resourceName);
});

console.log(
	"today is",
	DateWrapper.now().format("YYYY-MM-DD"),
	exports["rpjs-config"].getServerConfig(),
);

setImmediate(async () => {
	console.log("Immediate callback executed");
	await pool.getConnection();
	const players = await db
		.select()
		.from(schema.players)
		.where(eq(schema.players.id, 2));

	console.log("players:", players);
});
