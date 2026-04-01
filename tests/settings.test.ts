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
import type { VisibleCursorPluginSettings } from '../settings';

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
			flashSize: 15
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
