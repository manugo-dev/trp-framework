import { defineConfig, globalIgnores } from "eslint/config";
import {
	defineConfigWithVueTs,
	vueTsConfigs,
} from "@vue/eslint-config-typescript";
import pluginVue from "eslint-plugin-vue";
import { standardTypeChecked } from "@vue/eslint-config-standard-with-typescript";
import tseslint from "typescript-eslint";
import js from "@eslint/js";
import globals from "globals";

const vueRules = defineConfigWithVueTs(
	pluginVue.configs["flat/essential"],
	vueTsConfigs.recommendedTypeChecked,
	vueTsConfigs.stylisticTypeChecked,
	standardTypeChecked,
);

export default defineConfig([
	globalIgnores(["**/dist/*"]),
	{
		files: ["**/nui/**/*.{ts,mts,tsx,vue}"],
		...vueRules,
	},
	{
		files: ["**/*.{ts}"],
		...tseslint.configs.recommended,
	},
	{
		files: ["**/*.{js,mjs,cjs}"],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		plugins: {
			js,
		},
		extends: ["js/recommended"],
	},
]);
