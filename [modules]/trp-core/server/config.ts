import { z } from "zod";
import { configFor } from "@trp/config";

export const CoreConfigSchema = z.object({
	featureFlags: z
		.object({
			playerSessionAudit: z.boolean().default(true),
			rbac: z.boolean().default(true),
		})
		.default({}),
	limits: z
		.object({
			maxCharactersPerPlayer: z.number().int().positive().default(3),
		})
		.default({}),
});

export type CoreConfig = z.infer<typeof CoreConfigSchema>;

export function getCoreConfig(): CoreConfig {
	return configFor("trp-core", CoreConfigSchema);
}
