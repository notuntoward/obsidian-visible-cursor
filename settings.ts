import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';

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

	getSettingDefinitions(): SettingDefinitionItem[] {
		const s = this.plugin.settings;
		const isLineHighlightOff = () => s.lineHighlightMode === 'off';
		const isFlashActive = () => !isLineHighlightOff() || s.customCursorMode === 'flash';
		return [
			{
				type: 'group',
				heading: 'Cursor Appearance',
				items: [
					{
						name: 'Show custom cursor',
						desc: 'When to show a custom cursor',
						control: {
							type: 'dropdown',
							key: 'customCursorMode',
							options: {
								always: 'Always on',
								flash: 'Only during flash',
								off: 'Off (use Obsidian default cursor)'
							}
						}
					},
					{
						name: 'Custom cursor style',
						desc: 'Visual style of the custom cursor',
						control: {
							type: 'dropdown',
							key: 'customCursorStyle',
							options: { block: 'Block', bar: 'Bar', thinbar: 'Thin bar' },
							disabled: () => s.customCursorMode === 'off'
						}
					}
				]
			},
			{
				type: 'group',
				heading: 'Flash Effect',
				items: [
					{
						name: 'Line highlight',
						desc: 'Show a gradient highlight on the current line during a flash',
						control: {
							type: 'dropdown',
							key: 'lineHighlightMode',
							options: {
								off: 'Off',
								centered: 'Centered around cursor',
								left: 'Left to Right',
								right: 'Right to Left'
							}
						}
					},
					{
						name: 'Flash duration',
						desc: "How long the flash lasts (applies to line highlight and 'Only during flash' cursor)",
						control: {
							type: 'slider',
							key: 'flashDuration',
							min: 200,
							max: 1500,
							step: 50,
							disabled: () => !isFlashActive(),
							displayFormat: (value: number) => `${(value / 1000).toFixed(2)}s`
						}
					},
					{
						name: 'Flash size',
						desc: 'Width of the flash (4-30 characters)',
						control: {
							type: 'slider',
							key: 'flashSize',
							min: 4,
							max: 30,
							step: 1,
							disabled: () => isLineHighlightOff(),
							displayFormat: (value: number) => `${value}ch`
						}
					}
				]
			},
			{
				type: 'group',
				heading: 'Flash Triggers',
				items: [
					{
						name: 'On scroll',
						desc: 'Show flash when the view scrolls',
						control: {
							type: 'toggle',
							key: 'flashOnWindowScrolls',
							disabled: () => !isFlashActive()
						}
					},
					{
						name: 'On file switch',
						desc: 'Show flash when switching between notes or panes',
						control: {
							type: 'toggle',
							key: 'flashOnWindowChanges',
							disabled: () => !isFlashActive()
						}
					},
					{
						name: 'On navigation repeat end',
						desc: 'Show flash at the end of a keyboard repeat sequence (holding movement keys) if a large cursor movement occurred',
						control: {
							type: 'toggle',
							key: 'flashOnRepeatEnd',
							disabled: () => !isFlashActive()
						}
					}
				]
			},
			{
				type: 'group',
				heading: 'Colors',
				items: [
					{
						name: 'Use theme colors',
						desc: "Use theme's accent color. Turn off to pick custom colors.",
						control: {
							type: 'toggle',
							key: 'useThemeColors'
						}
					},
					{
						name: 'Light theme color',
						desc: 'Color for light theme',
						control: {
							type: 'color',
							key: 'cursorCustomColorLight',
							disabled: () => s.useThemeColors
						}
					},
					{
						name: 'Dark theme color',
						desc: 'Color for dark theme',
						control: {
							type: 'color',
							key: 'cursorCustomColorDark',
							disabled: () => s.useThemeColors
						}
					}
				]
			}
		];
	}

	override getControlValue(key: string): unknown {
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
		if (['customCursorMode', 'customCursorStyle', 'useThemeColors', 'cursorCustomColorLight', 'cursorCustomColorDark'].includes(key)) {
			this.plugin.refreshDecorations();
		}
		this.update();
	}
}
