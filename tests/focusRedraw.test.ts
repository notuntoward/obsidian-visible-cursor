import { describe, expect, it, vi } from 'vitest';
import { EditorSelection } from '@codemirror/state';
import { DEFAULT_SETTINGS } from '../settings';

vi.mock('obsidian', () => ({
	App: class App {},
	Plugin: class Plugin {
		app: unknown;
		constructor(app?: unknown) {
			this.app = app ?? {};
		}
		registerEditorExtension(): void {}
		registerEvent(): void {}
		addSettingTab(): void {}
		registerDomEvent(): void {}
		registerInterval(): void {}
		register(): void {}
		loadData(): Promise<Record<string, unknown>> { return Promise.resolve({}); }
		saveData(): Promise<void> { return Promise.resolve(); }
	},
	MarkdownView: class MarkdownView {},
	Notice: class Notice {},
	PluginSettingTab: class PluginSettingTab {},
	Setting: class Setting {}
}));

import VisibleCursorPlugin, { CustomCursorViewPlugin } from '../main';

function makeViewPlugin() {
	const plugin = new VisibleCursorPlugin({} as never, {} as never);
	plugin.settings = { ...DEFAULT_SETTINGS };
	const mockView = {
		dom: document.createElement('div'),
		scrollDOM: document.createElement('div'),
		contentDOM: document.createElement('div'),
		state: { selection: { main: { head: 0, anchor: 0, empty: true } } },
		requestMeasure: vi.fn(),
	};
	const viewPlugin = new CustomCursorViewPlugin(mockView as never, plugin);
	mockView.requestMeasure.mockClear();
	return { viewPlugin, mockView };
}

function makeUpdate(mockView: unknown, flags: Record<string, boolean>) {
	return {
		view: mockView,
		docChanged: false,
		selectionSet: false,
		focusChanged: false,
		geometryChanged: false,
		viewportChanged: false,
		changes: { mapPos: (p: number) => p },
		startState: { selection: { main: { head: 0 } } },
		state: { selection: { main: { head: 0 } } },
		...flags,
	};
}

describe('CustomCursorViewPlugin.update focus handling', () => {
	it('re-measures the custom cursor when only focus changed (regression: thin default cursor after pane switch)', () => {
		const { viewPlugin, mockView } = makeViewPlugin();
		viewPlugin.update(makeUpdate(mockView, { focusChanged: true }) as never);
		expect(mockView.requestMeasure).toHaveBeenCalledTimes(1);
	});

	it('does not re-measure when nothing relevant changed', () => {
		const { viewPlugin, mockView } = makeViewPlugin();
		viewPlugin.update(makeUpdate(mockView, {}) as never);
		expect(mockView.requestMeasure).not.toHaveBeenCalled();
	});
});
