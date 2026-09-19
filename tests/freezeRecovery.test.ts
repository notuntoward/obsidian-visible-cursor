import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import { ColorProvider } from '../src/services/colorProvider';

const mockNoticeCalls: any[] = [];
vi.mock('obsidian', () => ({
	App: class App {},
	Plugin: class Plugin {
		app: any;
		constructor(app?: any) {
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
	Notice: class Notice {
		constructor(msg: string, duration?: number) {
			mockNoticeCalls.push({ msg, duration });
		}
	},
	PluginSettingTab: class PluginSettingTab {},
	Setting: class Setting {},
	Platform: {
		isMacOS: false,
		isMobile: false,
		isDesktop: true,
	}
}));

import VisibleCursorPlugin, { CustomCursorViewPlugin } from '../main';

describe('Visible Cursor Freeze Recovery & Watchdog', () => {
	let plugin: VisibleCursorPlugin;
	let mockApp: any;
	let mockView: any;

	beforeEach(() => {
		mockNoticeCalls.length = 0;
		mockApp = {
			workspace: {
				activeLeaf: null,
				setActiveLeaf: vi.fn(),
			},
			plugins: {
				plugins: {},
				enabledPlugins: new Set(),
			},
			hotkeyManager: {
				getHotkeys: vi.fn(),
				getDefaultHotkeys: vi.fn(),
			},
		};
		plugin = new VisibleCursorPlugin(mockApp as any, {} as any);
		plugin.settings = { ...DEFAULT_SETTINGS };
		plugin.colorProvider = new ColorProvider();

		mockView = {
			focus: vi.fn(),
			requestMeasure: vi.fn(),
			state: {
				selection: { main: { head: 10, empty: true } },
				doc: { length: 100 },
			},
		};
	});

	it('recoverFromFreeze resets navigation state, restores focus, and shows a 10-second Notice', () => {
		plugin.blockWrapState = { logicalPos: 10, showPos: 10, assoc: 1 };
		(plugin as any).clickFenceActive = true;

		plugin.recoverFromFreeze(mockView as any, 'test_freeze');

		expect(plugin.blockWrapState).toBeNull();
		expect((plugin as any).clickFenceActive).toBe(false);
		expect(mockView.focus).toHaveBeenCalled();
		expect(mockView.requestMeasure).toHaveBeenCalled();

		expect(mockNoticeCalls.length).toBe(1);
		expect(mockNoticeCalls[0].duration).toBe(10000);
		expect(mockNoticeCalls[0].msg).toContain('Navigation freeze detected and recovered');
		expect(mockNoticeCalls[0].msg).toContain('Likely cause: Another plugin');
	});

	it('debounces the freeze Notice so repeated calls within 10s only show one toast', () => {
		plugin.recoverFromFreeze(mockView as any, 'freeze_1');
		plugin.recoverFromFreeze(mockView as any, 'freeze_2');

		expect(mockNoticeCalls.length).toBe(1);
	});

	it('synchronizes activeLeaf if view belongs to a different leaf', () => {
		const targetLeaf = { id: 'target' };
		mockApp.workspace.activeLeaf = { id: 'other' };
		(plugin as any).getWorkspaceLeafForEditorView = vi.fn(() => targetLeaf);
		mockApp.workspace.iterateAllLeaves = vi.fn();

		plugin.recoverFromFreeze(mockView as any, 'leaf_sync');

		expect(mockApp.workspace.setActiveLeaf).toHaveBeenCalledWith(targetLeaf, { focus: true });
	});

	it('keydown watchdog detects 3 consecutive stalled movements and triggers recovery', () => {
		const recoverSpy = vi.spyOn(plugin, 'recoverFromFreeze');

		// Keydown event at pos 10 (not at boundary 0 or 100)
		const evt = { key: 'ArrowDown', ctrlKey: false, metaKey: false } as any;

		// 1st press
		plugin.handleKeydown(evt, mockView);
		expect(recoverSpy).not.toHaveBeenCalled();

		// 2nd press
		plugin.handleKeydown(evt, mockView);
		expect(recoverSpy).not.toHaveBeenCalled();

		// 3rd press at same pos
		plugin.handleKeydown(evt, mockView);
		expect(recoverSpy).toHaveBeenCalledWith(mockView, 'repeated_nav_stall');
	});

	it('does NOT track Ctrl+n as a movement key when Emacs plugin is NOT installed', () => {
		const recoverSpy = vi.spyOn(plugin, 'recoverFromFreeze');
		const ctrlNEvt = { key: 'n', ctrlKey: true, metaKey: false } as any;

		// Press Ctrl+n 3 times
		plugin.handleKeydown(ctrlNEvt, mockView);
		plugin.handleKeydown(ctrlNEvt, mockView);
		plugin.handleKeydown(ctrlNEvt, mockView);

		// Must not trigger recovery because Emacs plugin is not installed
		expect(recoverSpy).not.toHaveBeenCalled();
	});

	it('tracks Emacs movement commands when Emacs plugin is installed', () => {
		const recoverSpy = vi.spyOn(plugin, 'recoverFromFreeze');
		// Enable emacs-text-editor plugin
		mockApp.plugins.plugins['emacs-text-editor'] = {};

		const emacsEvt = { key: 'n', ctrlKey: true, metaKey: false } as any;

		plugin.handleKeydown(emacsEvt, mockView);
		expect(recoverSpy).not.toHaveBeenCalled();

		plugin.handleKeydown(emacsEvt, mockView);
		expect(recoverSpy).not.toHaveBeenCalled();

		plugin.handleKeydown(emacsEvt, mockView);
		expect(recoverSpy).toHaveBeenCalledWith(mockView, 'repeated_nav_stall');
	});

	it('dynamically adapts when Emacs key mapping changes in hotkeyManager', () => {
		const recoverSpy = vi.spyOn(plugin, 'recoverFromFreeze');
		mockApp.plugins.plugins['emacs-text-editor'] = {};

		// User remaps emacs-text-editor:next-line to Alt+j
		mockApp.hotkeyManager.getHotkeys = (commandId: string) => {
			if (commandId === 'emacs-text-editor:next-line') {
				return [{ modifiers: ['Alt'], key: 'j' }];
			}
			return null;
		};

		// Old Ctrl+n should no longer be tracked as movement
		const oldEvt = { key: 'n', ctrlKey: true, metaKey: false } as any;
		plugin.handleKeydown(oldEvt, mockView);
		plugin.handleKeydown(oldEvt, mockView);
		plugin.handleKeydown(oldEvt, mockView);
		expect(recoverSpy).not.toHaveBeenCalled();

		// New Alt+j should be tracked
		const newEvt = { key: 'j', altKey: true, ctrlKey: false, metaKey: false } as any;
		plugin.handleKeydown(newEvt, mockView);
		plugin.handleKeydown(newEvt, mockView);
		plugin.handleKeydown(newEvt, mockView);
		expect(recoverSpy).toHaveBeenCalledWith(mockView, 'repeated_nav_stall');
	});

	it('does not treat movement at document boundary as a stall', () => {
		const recoverSpy = vi.spyOn(plugin, 'recoverFromFreeze');

		// Backward movement at position 0
		mockView.state.selection.main.head = 0;
		const upEvt = { key: 'ArrowUp', ctrlKey: false, metaKey: false } as any;
		for (let i = 0; i < 5; i++) {
			plugin.handleKeydown(upEvt, mockView);
		}
		expect(recoverSpy).not.toHaveBeenCalled();

		// Forward movement at EOF (pos 100)
		mockView.state.selection.main.head = 100;
		const downEvt = { key: 'ArrowDown', ctrlKey: false, metaKey: false } as any;
		for (let i = 0; i < 5; i++) {
			plugin.handleKeydown(downEvt, mockView);
		}
		expect(recoverSpy).not.toHaveBeenCalled();
	});

	it('catches exceptions in keymap navigation handlers, recovers, and falls back to native navigation (returns false)', () => {
		const recoverSpy = vi.spyOn(plugin, 'recoverFromFreeze');

		const filter = (plugin as any).createBlockCursorNavFilter();
		const throwingView = {
			state: {
				selection: {
					main: { head: 5, empty: true, assoc: -1 },
					ranges: [{ head: 5 }],
				},
				doc: {
					lineAt: () => { throw new Error('Simulated DOM measure failure on unrevealed tab'); },
				},
			},
		} as any;

		let handleRight: any = null;
		for (const ext of filter) {
			if (ext && ext.value && Array.isArray(ext.value)) {
				for (const binding of ext.value) {
					if (binding.key === 'ArrowRight') handleRight = binding.run;
				}
			}
		}

		if (handleRight) {
			const result = handleRight(throwingView);
			expect(result).toBe(false); // Clean fallback to native navigation
			expect(recoverSpy).toHaveBeenCalledWith(throwingView, 'handleRight_error');
		}
	});

	it('does not crash or freeze when large text deletion (kill-region) shrinks the document', () => {
		// Mock view with doc length 50 where lineAt throws if pos > 50
		const shrinkView = {
			hasFocus: true,
			composing: false,
			defaultLineHeight: 20,
			defaultCharacterWidth: 10,
			requestMeasure: vi.fn(),
			scrollDOM: {
				scrollTop: 0,
				scrollLeft: 0,
				getBoundingClientRect: () => ({ top: 0, left: 0, bottom: 500, right: 500 }),
				contains: () => true,
				appendChild: vi.fn(),
			},
			state: {
				selection: { main: { head: 20, empty: true, assoc: 1 } },
				doc: {
					length: 50,
					lineAt: (pos: number) => {
						if (pos < 0 || pos > 50) {
							throw new RangeError('Position ' + pos + ' is out of bounds (doc length: 50)');
						}
						return { number: 1, from: 0, to: 50, text: 'Sample text remaining after kill region' };
					},
				},
			},
			coordsAtPos: (_pos: number) => ({ top: 10, bottom: 30, left: 10, right: 20 }),
			domAtPos: () => ({ node: { nodeType: 3, textContent: 'a', parentElement: null }, offset: 0 }),
		} as any;

		const layer = new CustomCursorViewPlugin(shrinkView, plugin);

		// Simulate pre-deletion cursor position past the new document length
		(layer as any).lastCursorDocPos = 180;
		(layer as any).docChangedInUpdate = false; // as happens when follow-up selection dispatches

		// Calling read() must NOT throw RangeError
		const req = (layer as any).buildMeasureReq();
		expect(() => req.read(shrinkView)).not.toThrow();

		// The position must be safely clamped/updated
		expect((layer as any).lastCursorDocPos).toBeLessThanOrEqual(50);
	});
});
