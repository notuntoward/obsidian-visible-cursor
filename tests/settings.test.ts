import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({
	App: class App {},
	PluginSettingTab: class PluginSettingTab { update() {} refreshDomState() {} },
	Setting: class Setting {}
}));

vi.mock('commons/flash', async (importOriginal) => {
	const actual = await importOriginal<typeof import('commons/flash')>();
	return { ...actual, createLineFlashSettingsGroup: vi.fn(actual.createLineFlashSettingsGroup) };
});

vi.mock('../main', () => ({
	default: class VisibleCursorPluginMock {}
}));

import { DEFAULT_SETTINGS } from '../settings';
import { createLineFlashSettingsGroup, LINE_FLASH_SETTINGS_CLASS } from 'commons/flash';
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
	it('previews the same automatic color used by the cursor and line flash', () => {
		const settings = { ...DEFAULT_SETTINGS, useThemeColors: false };
		const getColor = vi.fn(() => ({ color: 'rgb(203, 197, 240)', opacity: 0.8 }));
		const tab = new VisibleCursorSettingTab({} as never, { settings, colorProvider: { getColor } } as never);
		tab.getSettingDefinitions();
		const calls = vi.mocked(createLineFlashSettingsGroup).mock.calls;
		const colors = calls[calls.length - 1]?.[0].colors;
		expect(colors?.themeFlash?.()).toEqual({ color: 'rgb(203, 197, 240)', opacity: 0.8 });
		expect(getColor).toHaveBeenCalledWith({ ...settings, useThemeColors: true });
		expect(settings.useThemeColors).toBe(false);
	});

	it('refreshes automatic previews when cursor style changes', async () => {
		const settings = { ...DEFAULT_SETTINGS };
		const tab = new VisibleCursorSettingTab({} as never, {
			settings, saveSettings: vi.fn(), refreshDecorations: vi.fn(),
		} as never);
		const update = vi.spyOn(tab, 'update');
		await tab.setControlValue('customCursorStyle', 'bar');
		expect(settings.customCursorStyle).toBe('bar');
		expect(update).toHaveBeenCalledOnce();
	});

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
