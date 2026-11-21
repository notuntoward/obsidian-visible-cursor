import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';

import { createLineFlashSettingsGroup, LINE_FLASH_DEFAULT_PROFILE } from 'commons/flash';

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
	lineHighlightMode: LINE_FLASH_DEFAULT_PROFILE.mode,
	cursorCustomColorLight: '#6496ff',
	cursorCustomColorDark: '#6496ff',
	flashDuration: LINE_FLASH_DEFAULT_PROFILE.durationMs,
	useThemeColors: true,
	flashOnWindowScrolls: true,
	flashOnWindowChanges: true,
	flashSize: LINE_FLASH_DEFAULT_PROFILE.sizeChars,
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
			createLineFlashSettingsGroup({
				heading: 'Flash Effect',
				mode: {
					key: 'lineHighlightMode',
					aliases: ['Line highlight'],
					desc: 'Show a gradient highlight on the current line during a flash.',
				},
				duration: {
					key: 'flashDuration',
					aliases: ['Flash duration'],
					desc: "How long the flash lasts, including an 'Only during flash' cursor.",
					disabled: () => !isFlashActive(),
				},
				size: {
					key: 'flashSize',
					aliases: ['Flash size'],
					desc: 'Width of the bright part of the line flash.',
					disabled: () => isLineHighlightOff(),
				},
				colors: {
					aliases: ['Use theme colors', 'Cursor colors', 'Line flash colors'],
					desc: "Use the theme accent for the cursor and line flash, or choose separate light- and dark-theme colors.",
					themeFlash: () => this.plugin.colorProvider.getColor({ ...s, useThemeColors: true }),
					useTheme: {
						get: () => s.useThemeColors,
						set: (value) => this.setControlValue('useThemeColors', value),
					},
					light: {
						get: () => s.cursorCustomColorLight,
						set: (value) => this.setControlValue('cursorCustomColorLight', value),
					},
					dark: {
						get: () => s.cursorCustomColorDark,
						set: (value) => this.setControlValue('cursorCustomColorDark', value),
					},
				},
			}, this.containerEl?.ownerDocument),
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
		if (key === 'customCursorStyle') this.update();
		this.refreshDomState();
	}
}
