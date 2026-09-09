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
import { ColorProvider } from '../src/services/colorProvider';

type Rect = { top: number; bottom: number; left: number; right: number };

function createMockScrollDOM(): HTMLElement {
	const mockScrollDOM = document.createElement('div');
	mockScrollDOM.getBoundingClientRect = () => ({
		top: 0,
		left: 0,
		bottom: 500,
		right: 500,
		width: 500,
		height: 500,
		x: 0,
		y: 0,
		toJSON: () => {}
	});
	return mockScrollDOM;
}

describe('min-width fallback for collapsed link syntax', () => {
	it('extracts the visible character from the probed cell instead of blotting out with a space', () => {
		const docText = '[[test-notes/Note-01.md|First Link]] with some text';
		const aliasOffset = docText.indexOf('First Link'); // 24

		const plugin = new VisibleCursorPlugin({} as never, {} as never);
		plugin.settings = { ...DEFAULT_SETTINGS, customCursorStyle: 'block' };
		plugin.colorProvider = new ColorProvider();
		plugin.debugCursorDiagnostics = false;

		const coordsMap = new Map<number, Rect>();
		// Positions 0..24 are collapsed (width 0, left = 100)
		for (let p = 0; p <= aliasOffset; p++) {
			coordsMap.set(p, { left: 100, right: 100, top: 10, bottom: 30 });
		}
		// Position 25: right edge of 'F' is at 110 (width 10)
		coordsMap.set(aliasOffset + 1, { left: 110, right: 110, top: 10, bottom: 30 });

		const mockView = {
			state: {
				doc: {
					length: docText.length,
					lineAt: () => ({ from: 0, to: docText.length, number: 1, text: docText })
				},
				selection: {
					main: { head: 0, anchor: 0, assoc: -1 as const, empty: true },
					ranges: [{ head: 0, anchor: 0 }]
				}
			},
			coordsAtPos: (pos: number) => coordsMap.get(pos) ?? { left: 110 + (pos - aliasOffset - 1) * 10, right: 110 + (pos - aliasOffset - 1) * 10, top: 10, bottom: 30 },
			domAtPos: () => ({ node: null, offset: 0 }),
			scrollDOM: createMockScrollDOM(),
			contentDOM: document.createElement('div'),
			defaultCharacterWidth: 10,
			defaultLineHeight: 20,
			hasFocus: true,
			composing: false,
			requestMeasure: vi.fn()
		};

		const cursorPlugin = new CustomCursorViewPlugin(mockView as never, plugin);
		const measureReq = (cursorPlugin as any).buildMeasureReq();
		const result = measureReq.read(mockView);

		expect(result).not.toBeNull();
		// Should have resolved to 'F' via visibleCell, NOT ' ' (blotted out) and NOT '[' (hidden syntax)
		expect(result.char).toBe('F');
		expect(result.width).toBe(10);
	});

	it('extracts the visible character on Home key navigation to line start', () => {
		const docText = '[[test-notes/Note-01.md|First Link]] with some text';
		const aliasOffset = docText.indexOf('First Link');

		const plugin = new VisibleCursorPlugin({} as never, {} as never);
		plugin.settings = { ...DEFAULT_SETTINGS, customCursorStyle: 'block' };
		plugin.colorProvider = new ColorProvider();
		plugin.debugCursorDiagnostics = false;
		plugin.lastUserEvent = 'home';

		const coordsMap = new Map<number, Rect>();
		for (let p = 0; p <= aliasOffset; p++) {
			coordsMap.set(p, { left: 100, right: 100, top: 10, bottom: 30 });
		}
		coordsMap.set(aliasOffset + 1, { left: 110, right: 110, top: 10, bottom: 30 });

		const mockView = {
			state: {
				doc: {
					length: docText.length,
					lineAt: () => ({ from: 0, to: docText.length, number: 1, text: docText })
				},
				selection: {
					main: { head: 0, anchor: 0, assoc: -1 as const, empty: true },
					ranges: [{ head: 0, anchor: 0 }]
				}
			},
			coordsAtPos: (pos: number) => coordsMap.get(pos) ?? { left: 110 + (pos - aliasOffset - 1) * 10, right: 110 + (pos - aliasOffset - 1) * 10, top: 10, bottom: 30 },
			domAtPos: () => ({ node: null, offset: 0 }),
			scrollDOM: createMockScrollDOM(),
			contentDOM: document.createElement('div'),
			defaultCharacterWidth: 10,
			defaultLineHeight: 20,
			hasFocus: true,
			composing: false,
			requestMeasure: vi.fn()
		};

		const cursorPlugin = new CustomCursorViewPlugin(mockView as never, plugin);
		const measureReq = (cursorPlugin as any).buildMeasureReq();
		const result = measureReq.read(mockView);

		expect(result).not.toBeNull();
		expect(result.char).toBe('F');
		expect(result.width).toBe(10);
	});

	it('extracts the first visible character for non-aliased links [[Note-01]]', () => {
		const docText = '[[Note-01]] with some text';
		const linkTextOffset = 2; // after '[['

		const plugin = new VisibleCursorPlugin({} as never, {} as never);
		plugin.settings = { ...DEFAULT_SETTINGS, customCursorStyle: 'block' };
		plugin.colorProvider = new ColorProvider();
		plugin.debugCursorDiagnostics = false;

		const coordsMap = new Map<number, Rect>();
		// Positions 0..2 are collapsed (width 0, left = 100)
		for (let p = 0; p <= linkTextOffset; p++) {
			coordsMap.set(p, { left: 100, right: 100, top: 10, bottom: 30 });
		}
		// Position 3: right edge of 'N' is at 110 (width 10)
		coordsMap.set(linkTextOffset + 1, { left: 110, right: 110, top: 10, bottom: 30 });

		const mockView = {
			state: {
				doc: {
					length: docText.length,
					lineAt: () => ({ from: 0, to: docText.length, number: 1, text: docText })
				},
				selection: {
					main: { head: 0, anchor: 0, assoc: -1 as const, empty: true },
					ranges: [{ head: 0, anchor: 0 }]
				}
			},
			coordsAtPos: (pos: number) => coordsMap.get(pos) ?? { left: 110 + (pos - linkTextOffset - 1) * 10, right: 110 + (pos - linkTextOffset - 1) * 10, top: 10, bottom: 30 },
			domAtPos: () => ({ node: null, offset: 0 }),
			scrollDOM: createMockScrollDOM(),
			contentDOM: document.createElement('div'),
			defaultCharacterWidth: 10,
			defaultLineHeight: 20,
			hasFocus: true,
			composing: false,
			requestMeasure: vi.fn()
		};

		const cursorPlugin = new CustomCursorViewPlugin(mockView as never, plugin);
		const measureReq = (cursorPlugin as any).buildMeasureReq();
		const result = measureReq.read(mockView);

		expect(result).not.toBeNull();
		expect(result.char).toBe('N');
		expect(result.width).toBe(10);
	});

	it('falls back to space and default character width if no renderable cell is found', () => {
		const docText = '[[collapsed-to-end]]';

		const plugin = new VisibleCursorPlugin({} as never, {} as never);
		plugin.settings = { ...DEFAULT_SETTINGS, customCursorStyle: 'block' };
		plugin.colorProvider = new ColorProvider();
		plugin.debugCursorDiagnostics = false;

		const mockView = {
			state: {
				doc: {
					length: docText.length,
					lineAt: () => ({ from: 0, to: docText.length, number: 1, text: docText })
				},
				selection: {
					main: { head: 0, anchor: 0, assoc: -1 as const, empty: true },
					ranges: [{ head: 0, anchor: 0 }]
				}
			},
			// All positions have 0 width
			coordsAtPos: () => ({ left: 100, right: 100, top: 10, bottom: 30 }),
			domAtPos: () => ({ node: null, offset: 0 }),
			scrollDOM: createMockScrollDOM(),
			contentDOM: document.createElement('div'),
			defaultCharacterWidth: 10,
			defaultLineHeight: 20,
			hasFocus: true,
			composing: false,
			requestMeasure: vi.fn()
		};

		const cursorPlugin = new CustomCursorViewPlugin(mockView as never, plugin);
		const measureReq = (cursorPlugin as any).buildMeasureReq();
		const result = measureReq.read(mockView);

		expect(result).not.toBeNull();
		expect(result.char).toBe(' ');
		expect(result.width).toBe(10);
	});

	it('manages visible-cursor-hide-caret and visible-cursor-hide-default classes on view.dom and view.contentDOM', () => {
		const docText = 'Hello world';
		const plugin = new VisibleCursorPlugin({} as never, {} as never);
		plugin.settings = { ...DEFAULT_SETTINGS, customCursorStyle: 'block' };
		plugin.colorProvider = new ColorProvider();

		const contentDOM = document.createElement('div');
		contentDOM.className = 'cm-content';
		const dom = document.createElement('div');
		dom.className = 'cm-editor';
		dom.appendChild(contentDOM);

		const mockView = {
			state: {
				doc: {
					length: docText.length,
					lineAt: () => ({ from: 0, to: docText.length, number: 1, text: docText })
				},
				selection: {
					main: { head: 0, anchor: 0, assoc: -1 as const, empty: true },
					ranges: [{ head: 0, anchor: 0 }]
				}
			},
			coordsAtPos: () => ({ left: 100, right: 110, top: 10, bottom: 30 }),
			domAtPos: () => ({ node: null, offset: 0 }),
			scrollDOM: createMockScrollDOM(),
			contentDOM,
			dom,
			defaultCharacterWidth: 10,
			defaultLineHeight: 20,
			hasFocus: true,
			composing: false,
			requestMeasure: vi.fn()
		};

		const cursorPlugin = new CustomCursorViewPlugin(mockView as never, plugin);
		const measureReq = (cursorPlugin as any).buildMeasureReq();

		// When measure is valid, write() adds suppression classes to contentDOM and dom
		const measure = measureReq.read(mockView);
		measureReq.write(measure);

		expect(contentDOM.classList.contains('visible-cursor-hide-caret')).toBe(true);
		expect(dom.classList.contains('visible-cursor-hide-default')).toBe(true);

		// When measure is null (e.g. editor blurred or customCursorMode off), classes are removed
		measureReq.write(null);
		expect(contentDOM.classList.contains('visible-cursor-hide-caret')).toBe(false);
		expect(dom.classList.contains('visible-cursor-hide-default')).toBe(false);

		// Re-add and verify destroy() cleans up classes
		measureReq.write(measure);
		expect(contentDOM.classList.contains('visible-cursor-hide-caret')).toBe(true);
		expect(dom.classList.contains('visible-cursor-hide-default')).toBe(true);

		cursorPlugin.destroy();
		expect(contentDOM.classList.contains('visible-cursor-hide-caret')).toBe(false);
		expect(dom.classList.contains('visible-cursor-hide-default')).toBe(false);
	});
});

