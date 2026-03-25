import { App, PluginSettingTab, Setting } from 'obsidian';

import VisibleCursorPlugin from './main';

export interface VisibleCursorPluginSettings {
	customCursorMode: 'always' | 'flash' | 'off';
	customCursorStyle: 'block' | 'bar' | 'thinbar';
	lineHighlightMode: 'left' | 'centered' | 'right' | 'off';
	cursorCustomColorLight: string;
	cursorCustomColorDark: string;
	flashDuration: number;
	useThemeColors: boolean;
	flashOnWindowScrolls: boolean;
	flashOnWindowChanges: boolean;
	flashSize: number;
}

export const DEFAULT_SETTINGS: VisibleCursorPluginSettings = {
	customCursorMode: 'always',
	customCursorStyle: 'block',
	lineHighlightMode: 'centered',
	cursorCustomColorLight: '#6496ff',
	cursorCustomColorDark: '#6496ff',
	flashDuration: 1000,
	useThemeColors: true,
	flashOnWindowScrolls: true,
	flashOnWindowChanges: true,
	flashSize: 15
}

export class VisibleCursorSettingTab extends PluginSettingTab {
	plugin: VisibleCursorPlugin;

	constructor(app: App, plugin: VisibleCursorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.addClass('visible-cursor-settings');

		// ===========================================
		// CURSOR APPEARANCE
		// ===========================================
		new Setting(containerEl)
			.setName('Cursor Appearance')
			.setHeading();

		new Setting(containerEl)
			.setName('Show custom cursor')
			.setDesc('When to show a custom cursor')
			.addDropdown(dropdown => dropdown
				.addOption('always', 'Always on')
				.addOption('flash', 'Only during flash')
				.addOption('off', 'Off (use Obsidian default cursor)')
				.setValue(this.plugin.settings.customCursorMode)
				.onChange(async (value: 'always' | 'flash' | 'off') => {
					this.plugin.settings.customCursorMode = value;
					await this.plugin.saveSettings();
					this.plugin.refreshDecorations();
				}));

		new Setting(containerEl)
			.setName('Custom cursor style')
			.setDesc('Visual style of the custom cursor')
			.addDropdown(dropdown => dropdown
				.addOption('block', 'Block')
				.addOption('bar', 'Bar')
				.addOption('thinbar', 'Thin bar')
				.setValue(this.plugin.settings.customCursorStyle)
				.onChange(async (value: 'block' | 'bar' | 'thinbar') => {
					this.plugin.settings.customCursorStyle = value;
					await this.plugin.saveSettings();
					this.plugin.refreshDecorations();
				}));

		// ===========================================
		// FLASH EFFECT
		// ===========================================
		new Setting(containerEl)
			.setName('Flash Effect')
			.setHeading();

		new Setting(containerEl)
			.setName('Line highlight')
			.setDesc('Show a gradient highlight on the current line during a flash')
			.addDropdown(dropdown => dropdown
				.addOption('off', 'Off')
				.addOption('centered', 'Centered around cursor')
				.addOption('left', 'Left to Right')
				.addOption('right', 'Right to Left')
				.setValue(this.plugin.settings.lineHighlightMode)
				.onChange(async (value: 'left' | 'centered' | 'right' | 'off') => {
					this.plugin.settings.lineHighlightMode = value;
					await this.plugin.saveSettings();
				}));

		const fadeDurationSetting = new Setting(containerEl)
			.setName('Flash duration')
			.setDesc(`How long the flash lasts (applies to line highlight and 'Only during flash' cursor) (0.2s - 1.5s) - ${(this.plugin.settings.flashDuration / 1000).toFixed(2)}s`)
			.addSlider(slider => slider
				.setLimits(0.2, 1.5, 0.05)
				.setValue(this.plugin.settings.flashDuration / 1000)
				.setDynamicTooltip()
				.onChange(async (value: number) => {
						this.plugin.settings.flashDuration = Math.round(value * 1000);
						fadeDurationSetting.setDesc(`How long the flash lasts (applies to line highlight and 'Only during flash' cursor) (0.2s - 1.5s) - ${value.toFixed(2)}s`);
						await this.plugin.saveSettings();
					}));

		const flashSizeSetting = new Setting(containerEl)
			.setName('Flash size')
			.setDesc(`Width of the flash (4-30 characters) - ${this.plugin.settings.flashSize}ch`)
			.addSlider(slider => slider
				.setLimits(4, 30, 1)
				.setValue(this.plugin.settings.flashSize)
				.setDynamicTooltip()
				.onChange(async (value: number) => {
					this.plugin.settings.flashSize = value;
					flashSizeSetting.setDesc(`Width of the flash (4-30 characters) - ${value}ch`);
					await this.plugin.saveSettings();
				}));

		// ===========================================
		// FLASH TRIGGERS
		// ===========================================
		new Setting(containerEl)
			.setName('Flash Triggers')
			.setHeading();

		new Setting(containerEl)
			.setName('On scroll')
			.setDesc('Show flash when the view scrolls')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.flashOnWindowScrolls)
				.onChange(async (value) => {
					this.plugin.settings.flashOnWindowScrolls = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('On file switch')
			.setDesc('Show flash when switching between notes or panes')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.flashOnWindowChanges)
				.onChange(async (value) => {
					this.plugin.settings.flashOnWindowChanges = value;
					await this.plugin.saveSettings();
				}));

		// ===========================================
		// COLORS
		// ===========================================
		new Setting(containerEl)
			.setName('Colors')
			.setHeading();

		new Setting(containerEl)
			.setName('Use theme colors')
			.setDesc('Use theme\'s accent color. Turn off to pick custom colors.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useThemeColors)
				.onChange(async (value) => {
					this.plugin.settings.useThemeColors = value;
					await this.plugin.saveSettings();
					this.plugin.refreshDecorations();
					this.display();
				}));

		if (!this.plugin.settings.useThemeColors) {
			new Setting(containerEl)
				.setName('Light theme color')
				.setDesc('Color for light theme')
				.addColorPicker(colorPicker => colorPicker
					.setValue(this.plugin.settings.cursorCustomColorLight)
					.onChange(async (value) => {
						this.plugin.settings.cursorCustomColorLight = value;
						await this.plugin.saveSettings();
						this.plugin.refreshDecorations();
					}));

			new Setting(containerEl)
				.setName('Dark theme color')
				.setDesc('Color for dark theme')
				.addColorPicker(colorPicker => colorPicker
					.setValue(this.plugin.settings.cursorCustomColorDark)
					.onChange(async (value) => {
						this.plugin.settings.cursorCustomColorDark = value;
						await this.plugin.saveSettings();
						this.plugin.refreshDecorations();
					}));
		}
	}
}
