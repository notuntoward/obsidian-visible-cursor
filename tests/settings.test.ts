import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({
	App: class App {},
	PluginSettingTab: class PluginSettingTab {},
	Setting: class Setting {}
}));

vi.mock('../main', () => ({
	default: class VisibleCursorPluginMock {}
}));

import { DEFAULT_SETTINGS } from '../settings';
import { LINE_FLASH_SETTINGS_CLASS } from 'commons/flash';
import { VisibleCursorSettingTab } from '../settings';
import type { VisibleCursorPluginSettings } from '../settings';
import type { SettingDefinitionGroup } from 'obsidian';

describe('DEFAULT_SETTINGS', () => {
	it('should match the real exported defaults exactly', () => {
		const expected: VisibleCursorPluginSettings = {
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

		expect(DEFAULT_SETTINGS).toEqual(expected);
	});

	it('should expose exactly the settings keys expected by the plugin', () => {
		expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual([
			'cursorCustomColorDark',
			'cursorCustomColorLight',
			'customCursorMode',
			'customCursorStyle',
			'flashDuration',
			'flashOnRepeatEnd',
			'flashOnWindowChanges',
			'flashOnWindowScrolls',
			'flashSize',
			'lineHighlightMode',
			'useThemeColors'
		]);
	});

	it('should keep defaults within the UI slider ranges', () => {
		expect(DEFAULT_SETTINGS.flashDuration).toBeGreaterThanOrEqual(200);
		expect(DEFAULT_SETTINGS.flashDuration).toBeLessThanOrEqual(1500);
		expect(DEFAULT_SETTINGS.flashSize).toBeGreaterThanOrEqual(4);
		expect(DEFAULT_SETTINGS.flashSize).toBeLessThanOrEqual(30);
	});
});

describe('VisibleCursorSettingTab', () => {
	it('uses one shared compact row for flash and cursor colors', () => {
		const settings = { ...DEFAULT_SETTINGS };
		const tab = new VisibleCursorSettingTab(
			{} as never,
			{ settings } as never,
		);
		const definitions = tab.getSettingDefinitions();
		const flash = definitions.find((item): item is SettingDefinitionGroup =>
			'type' in item && item.type === 'group' && item.heading === 'Flash Effect'
		);
		expect(flash).toBeDefined();
		if (!flash?.items) throw new Error('Missing flash settings');

		expect(flash.cls).toBe(LINE_FLASH_SETTINGS_CLASS);
		expect(flash.items.map((item) => 'name' in item ? item.name : '')).toEqual([
			'Direction',
			'Duration',
			'Width',
			'Colors',
		]);
		const controls = Object.fromEntries(flash.items.map((item) => [
			'name' in item ? item.name : '',
			'control' in item ? item.control : undefined
		])) as Record<string, { disabled?: () => boolean }>;

		settings.lineHighlightMode = 'off';
		settings.customCursorMode = 'always';
		expect(controls.Duration?.disabled?.()).toBe(true);
		expect(controls.Width?.disabled?.()).toBe(true);

		settings.customCursorMode = 'flash';
		expect(controls.Duration?.disabled?.()).toBe(false);
		expect(controls.Width?.disabled?.()).toBe(true);

		const colors = definitions.find((item): item is SettingDefinitionGroup =>
			'type' in item && item.type === 'group' && item.heading === 'Colors'
		);
		expect(colors).toBeUndefined();
		expect(flash.items[3]).toMatchObject({ name: 'Colors', render: expect.any(Function) });
	});
});
