export class App {}

export class Plugin {
	app: App;

	constructor(app?: App) {
		this.app = app ?? new App();
	}

	registerEditorExtension(): void {}
	registerEvent(): void {}
	addSettingTab(): void {}
	registerDomEvent(): void {}
	registerInterval(): void {}
	register(): void {}
	loadData(): Promise<Record<string, unknown>> {
		return Promise.resolve({});
	}
	saveData(): Promise<void> {
		return Promise.resolve();
	}
}

export class MarkdownView {}

export class PluginSettingTab {
	app: App;
	plugin: unknown;
	containerEl = {
		empty: () => {},
		addClass: () => {}
	};

	constructor(app: App, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
	}
}

export class Setting {
	constructor(_containerEl: unknown) {}

	setName(): this {
		return this;
	}

	setHeading(): this {
		return this;
	}

	setDesc(): this {
		return this;
	}

	addDropdown(callback: (dropdown: {
		addOption: (value: string, label: string) => unknown;
		setValue: (value: string) => unknown;
		onChange: (handler: (value: string) => unknown) => unknown;
	}) => unknown): this {
		callback({
			addOption: () => this,
			setValue: () => this,
			onChange: () => this
		});
		return this;
	}

	addSlider(callback: (slider: {
		setLimits: (min: number, max: number, step: number) => unknown;
		setValue: (value: number) => unknown;
		setDynamicTooltip: () => unknown;
		onChange: (handler: (value: number) => unknown) => unknown;
	}) => unknown): this {
		callback({
			setLimits: () => this,
			setValue: () => this,
			setDynamicTooltip: () => this,
			onChange: () => this
		});
		return this;
	}

	addToggle(callback: (toggle: {
		setValue: (value: boolean) => unknown;
		onChange: (handler: (value: boolean) => unknown) => unknown;
	}) => unknown): this {
		callback({
			setValue: () => this,
			onChange: () => this
		});
		return this;
	}

	addColorPicker(callback: (colorPicker: {
		setValue: (value: string) => unknown;
		onChange: (handler: (value: string) => unknown) => unknown;
	}) => unknown): this {
		callback({
			setValue: () => this,
			onChange: () => this
		});
		return this;
	}
}
