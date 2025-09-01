import { createPinia } from "pinia";
import { createApp, type App, type Component } from "vue";

interface BootstrapOptions {
	rootComponent: Component;
	plugins?: Array<(app: App) => void>;
	rootElementId?: string;
}

export function createNUI(options: BootstrapOptions): App {
	const { rootComponent, plugins = [], rootElementId = "#app" } = options;

	const app = createApp(rootComponent);

	// Always add Pinia
	app.use(createPinia());

	// Add custom plugins
	plugins.forEach(plugin => plugin(app));

	app.mount(rootElementId);

	return app;
}
