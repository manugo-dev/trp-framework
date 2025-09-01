import { App } from "@trp/nui/vue";
import Button from "./Button.vue";
import Input from "./Input.vue";

export const CoreComponents = {
	OrpButton: Button,
	OrpInput: Input,
};

export function setupComponents(app: App) {
	Object.entries(CoreComponents).forEach(([name, component]) => {
		app.component(name, component);
	});
}

export default CoreComponents;
