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
	flashOnRepeatEnd?: boolean;
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
	flashSize: 15,
	flashOnRepeatEnd: false
};

export class VisibleCursorSettingTab extends PluginSettingTab {
	plugin: VisibleCursorPlugin;

	constructor(app: App, plugin: VisibleCursorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private indentSetting(setting: Setting): Setting {
		if (setting && setting.settingEl) {
			setting.settingEl.classList.add('visible-cursor-indent');
		}
		return setting;
	}

	private setSettingDisabled(setting: Setting, disabled: boolean): void {
		if (!setting) return;
		if (typeof setting.setDisabled === 'function') {
			setting.setDisabled(disabled);
		}
		if (setting.settingEl && setting.settingEl.classList) {
			setting.settingEl.classList.toggle('is-disabled', disabled);
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('visible-cursor-settings');

		const settings = this.plugin.settings;

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
				.setValue(settings.customCursorMode)
				.onChange(async (value: 'always' | 'flash' | 'off') => {
					settings.customCursorMode = value;
					await this.plugin.saveSettings();
					this.plugin.refreshDecorations();
					updateDependencies();
				}));

		const customCursorStyleSetting = this.indentSetting(
			new Setting(containerEl)
				.setName('Custom cursor style')
				.setDesc('Visual style of the custom cursor')
				.addDropdown(dropdown => dropdown
					.addOption('block', 'Block')
					.addOption('bar', 'Bar')
					.addOption('thinbar', 'Thin bar')
					.setValue(settings.customCursorStyle)
					.onChange(async (value: 'block' | 'bar' | 'thinbar') => {
						settings.customCursorStyle = value;
						await this.plugin.saveSettings();
						this.plugin.refreshDecorations();
					}))
		);

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
				.setValue(settings.lineHighlightMode)
				.onChange(async (value: 'left' | 'centered' | 'right' | 'off') => {
					settings.lineHighlightMode = value;
					await this.plugin.saveSettings();
					updateDependencies();
				}));

		const fadeDurationSetting = this.indentSetting(
			new Setting(containerEl)
				.setName('Flash duration')
				.setDesc(`How long the flash lasts (applies to line highlight and 'Only during flash' cursor) - ${(settings.flashDuration / 1000).toFixed(2)}s`)
				.addSlider(slider => slider
					.setLimits(0.2, 1.5, 0.05)
					.setValue(settings.flashDuration / 1000)
					.setDynamicTooltip()
					.onChange(async (value: number) => {
						settings.flashDuration = Math.round(value * 1000);
						fadeDurationSetting.setDesc(`How long the flash lasts (applies to line highlight and 'Only during flash' cursor) - ${value.toFixed(2)}s`);
						await this.plugin.saveSettings();
					}))
		);

		const flashSizeSetting = this.indentSetting(
			new Setting(containerEl)
				.setName('Flash size')
				.setDesc(`Width of the flash (4-30 characters) - ${settings.flashSize}ch`)
				.addSlider(slider => slider
					.setLimits(4, 30, 1)
					.setValue(settings.flashSize)
					.setDynamicTooltip()
					.onChange(async (value: number) => {
						settings.flashSize = value;
						flashSizeSetting.setDesc(`Width of the flash (4-30 characters) - ${value}ch`);
						await this.plugin.saveSettings();
					}))
		);

		// ===========================================
		// FLASH TRIGGERS
		// ===========================================
		const flashTriggersHeader = new Setting(containerEl)
			.setName('Flash Triggers')
			.setHeading();

		const flashScrollSetting = this.indentSetting(
			new Setting(containerEl)
				.setName('On scroll')
				.setDesc('Show flash when the view scrolls')
				.addToggle(toggle => toggle
					.setValue(settings.flashOnWindowScrolls)
					.onChange(async (value) => {
						settings.flashOnWindowScrolls = value;
						await this.plugin.saveSettings();
					}))
		);

		const flashFileSwitchSetting = this.indentSetting(
			new Setting(containerEl)
				.setName('On file switch')
				.setDesc('Show flash when switching between notes or panes')
				.addToggle(toggle => toggle
					.setValue(settings.flashOnWindowChanges)
					.onChange(async (value) => {
						settings.flashOnWindowChanges = value;
						await this.plugin.saveSettings();
					}))
		);

		const flashRepeatEndSetting = this.indentSetting(
			new Setting(containerEl)
				.setName('On navigation repeat end')
				.setDesc('Show flash at the end of a keyboard repeat sequence (holding movement keys) if a large cursor movement occurred')
				.addToggle(toggle => toggle
					.setValue(!!settings.flashOnRepeatEnd)
					.onChange(async (value) => {
						settings.flashOnRepeatEnd = value;
						await this.plugin.saveSettings();
					}))
		);

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
				.setValue(settings.useThemeColors)
				.onChange(async (value) => {
					settings.useThemeColors = value;
					await this.plugin.saveSettings();
					this.plugin.refreshDecorations();
					updateDependencies();
				}));

		const lightColorSetting = this.indentSetting(
			new Setting(containerEl)
				.setName('Light theme color')
				.setDesc('Color for light theme')
				.addColorPicker(colorPicker => colorPicker
					.setValue(settings.cursorCustomColorLight)
					.onChange(async (value) => {
						settings.cursorCustomColorLight = value;
						await this.plugin.saveSettings();
						this.plugin.refreshDecorations();
					}))
		);

		const darkColorSetting = this.indentSetting(
			new Setting(containerEl)
				.setName('Dark theme color')
				.setDesc('Color for dark theme')
				.addColorPicker(colorPicker => colorPicker
					.setValue(settings.cursorCustomColorDark)
					.onChange(async (value) => {
						settings.cursorCustomColorDark = value;
						await this.plugin.saveSettings();
						this.plugin.refreshDecorations();
					}))
		);

		const updateDependencies = () => {
			const isCustomCursorOff = settings.customCursorMode === 'off';
			const isFlashCursor = settings.customCursorMode === 'flash';
			const isLineHighlightOff = settings.lineHighlightMode === 'off';

			// Flash feature is active if line highlight is on OR custom cursor is set to 'flash'
			const isFlashActive = !isLineHighlightOff || isFlashCursor;

			// Custom cursor style: disabled when custom cursor is off
			this.setSettingDisabled(customCursorStyleSetting, isCustomCursorOff);

			// Flash size: applies only to line highlight
			this.setSettingDisabled(flashSizeSetting, isLineHighlightOff);

			// Flash duration & triggers: disabled if no flash feature is active
			this.setSettingDisabled(fadeDurationSetting, !isFlashActive);
			this.setSettingDisabled(flashTriggersHeader, !isFlashActive);
			this.setSettingDisabled(flashScrollSetting, !isFlashActive);
			this.setSettingDisabled(flashFileSwitchSetting, !isFlashActive);
			this.setSettingDisabled(flashRepeatEndSetting, !isFlashActive);

			// Custom colors: disabled when useThemeColors is true
			const useTheme = settings.useThemeColors;
			this.setSettingDisabled(lightColorSetting, useTheme);
			this.setSettingDisabled(darkColorSetting, useTheme);
		};

		// Initial update on display
		updateDependencies();
	}
}
