import { describe, expect, it, vi } from 'vitest';
import { EditorSelection, Transaction } from '@codemirror/state';
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

import VisibleCursorPlugin, { isSoftWrap } from '../main';

type Rect = { top: number; bottom: number; left: number; right: number };

type FakeSelection = {
	main: {
		head: number;
		assoc: 1 | -1;
		empty: boolean;
	};
	ranges: Array<unknown>;
};

type FakeUpdate = {
	selectionSet: boolean;
	docChanged: boolean;
	transactions: Array<{ isUserEvent: (name: string) => boolean }>;
	state: {
		selection: FakeSelection;
	};
	startState: {
		selection: FakeSelection;
	};
	view: FakeView;
};

type FakeView = {
	state: {
		doc: {
			length: number;
			lineAt: (pos: number) => { from: number; to: number; number: number; text: string };
			line: (number: number) => { from: number; to: number; number: number; text: string };
			lines: number;
		};
		selection: FakeSelection;
	};
	defaultLineHeight: number;
	coordsAtPos: (pos: number, assoc: 1 | -1) => Rect | null;
	dispatch: ReturnType<typeof vi.fn>;
};

function makeSelection(head: number, assoc: 1 | -1): FakeSelection {
	return {
		main: { head, assoc, empty: true },
		ranges: [{}]
	};
}

function makeTransaction(userEvents: string[] = []) {
	return {
		isUserEvent: (name: string) => userEvents.includes(name)
	};
}

function makePlugin() {
	const plugin = new VisibleCursorPlugin({} as never, {} as never);
	plugin.settings = { ...DEFAULT_SETTINGS, customCursorStyle: 'block' };
	plugin.blockWrapState = null;
	plugin.lastKey = '';
	return plugin;
}

function makeView(coords: Record<string, Rect>, head: number, assoc: 1 | -1): FakeView {
	return {
		state: {
			doc: {
				length: 200,
				lineAt: () => ({ from: 0, to: 200, number: 1, text: 'x'.repeat(200) }),
				line: () => ({ from: 0, to: 200, number: 1, text: 'x'.repeat(200) }),
				lines: 1
			},
			selection: makeSelection(head, assoc)
		},
		defaultLineHeight: 20,
		coordsAtPos: (pos, assocAtPos) => coords[`${pos}:${assocAtPos}`] ?? null,
		dispatch: vi.fn()
	};
}

function makeUpdate(view: FakeView, oldHead: number, oldAssoc: 1 | -1, newHead: number, newAssoc: 1 | -1, userEvents: string[] = []): FakeUpdate {
	view.state.selection = makeSelection(newHead, newAssoc);
	return {
		selectionSet: true,
		docChanged: false,
		transactions: [makeTransaction(userEvents)],
		state: { selection: makeSelection(newHead, newAssoc) },
		startState: { selection: makeSelection(oldHead, oldAssoc) },
		view
	};
}

function getNavCorrection(plugin: VisibleCursorPlugin) {
	const [, navCorrection] = plugin.createBlockCursorNavFilter();
	return (navCorrection as unknown as { value: (update: FakeUpdate) => void }).value;
}

describe('home navigation wrap diagnostics', () => {
	it('does not dispatch wrap correction for Home-suppressed large jumps', () => {
		const plugin = makePlugin();
		plugin.lastKey = 'Home';

		const view = makeView(
			{
				'40:-1': { top: 0, bottom: 20, left: 0, right: 8 },
				'40:1': { top: 40, bottom: 60, left: 0, right: 8 },
				'8:-1': { top: 40, bottom: 60, left: 0, right: 8 }
			},
			8,
			-1
		);

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 40, -1, 8, -1));

		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
		expect(plugin.lastKey).toBe('');
	});

	it('does not treat plain non-Home jumps as wrap-correction candidates unless a wrap-state context exists', () => {
		const plugin = makePlugin();
		const view = makeView(
			{
				'40:-1': { top: 0, bottom: 20, left: 0, right: 8 },
				'8:-1': { top: 60, bottom: 80, left: 0, right: 8 },
				'8:1': { top: 100, bottom: 120, left: 0, right: 8 }
			},
			8,
			-1
		);

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 40, -1, 8, -1));

		expect(plugin.blockWrapState).toBeNull();
		expect(view.dispatch).not.toHaveBeenCalled();
	});

	it('sets lastUserEvent for emacs.moveToBeginning jumps (correction handled by buildMeasureReq)', () => {
		const plugin = makePlugin();
		const view = makeView(
			{
				'40:-1': { top: 0, bottom: 20, left: 0, right: 8 },
				'8:-1': { top: 60, bottom: 80, left: 0, right: 8 },
				'8:1': { top: 100, bottom: 120, left: 0, right: 8 }
			},
			8,
			-1
		);

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 40, -1, 8, -1, ['emacs.moveToBeginning']));

		// navCorrection no longer dispatches a correction (avoids updateListener side-effects).
		// Instead it sets lastUserEvent so buildMeasureReq can apply a rendering-only override.
		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
		expect((plugin as { lastUserEvent: string }).lastUserEvent).toBe('home');
	});

	it('does not dispatch correction for emacs.moveToBeginning jumps landing on non-soft-wrap positions', () => {
		const plugin = makePlugin();
		const view = makeView(
			{
				'40:-1': { top: 0, bottom: 20, left: 0, right: 8 },
				'8:-1': { top: 60, bottom: 80, left: 0, right: 8 },
				'8:1': { top: 60, bottom: 80, left: 0, right: 8 }
			},
			8,
			-1
		);

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 40, -1, 8, -1, ['emacs.moveToBeginning']));

		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
	});

	it('sets lastUserEvent for emacs.moveToEnd jumps (handled by buildMeasureReq)', () => {
		const plugin = makePlugin();
		const view = makeView(
			{
				'0:-1': { top: 0, bottom: 20, left: 0, right: 8 },
				'100:-1': { top: 0, bottom: 20, left: 800, right: 808 }
			},
			100,
			-1
		);

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 0, -1, 100, -1, ['emacs.moveToEnd']));

		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
		expect((plugin as { lastUserEvent: string }).lastUserEvent).toBe('end');
	});

	it('dispatches pos - 1 correction when end-move lands on a soft-wrap boundary', () => {
		const plugin = makePlugin();
		const view = makeView(
			{
				'0:-1': { top: 0, bottom: 20, left: 0, right: 8 },
				'50:-1': { top: 0, bottom: 20, left: 800, right: 808 },
				'50:1': { top: 20, bottom: 40, left: 0, right: 8 }
			},
			50,
			-1
		);

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 0, -1, 50, -1, ['emacs.moveToEnd']));

		expect(view.dispatch).toHaveBeenCalled();
		expect((plugin as { lastUserEvent: string }).lastUserEvent).toBe('end');
	});

	it('dispatches pos - 1 correction for selectLineEnd, selectLineBoundaryRight, and physical End key on soft wrap', () => {
		const events = ['selectLineEnd', 'selectLineBoundaryForward', 'selectLineBoundaryRight'];
		for (const event of events) {
			const plugin = makePlugin();
			const view = makeView(
				{
					'0:-1': { top: 0, bottom: 20, left: 0, right: 8 },
					'50:-1': { top: 0, bottom: 20, left: 800, right: 808 },
					'50:1': { top: 20, bottom: 40, left: 0, right: 8 }
				},
				50,
				-1
			);
			const navCorrection = getNavCorrection(plugin);
			navCorrection(makeUpdate(view, 0, -1, 50, -1, [event]));
			expect(view.dispatch).toHaveBeenCalled();
			expect((plugin as { lastUserEvent: string }).lastUserEvent).toBe('end');
		}

		// Also test large move with plugin.lastKey = "End"
		const plugin = makePlugin();
		(plugin as { lastKey: string }).lastKey = 'End';
		const view = makeView(
			{
				'0:-1': { top: 0, bottom: 20, left: 0, right: 8 },
				'50:-1': { top: 0, bottom: 20, left: 800, right: 808 },
				'50:1': { top: 20, bottom: 40, left: 0, right: 8 }
			},
			50,
			-1
		);
		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 0, -1, 50, -1, []));
		expect(view.dispatch).toHaveBeenCalled();
		expect((plugin as { lastUserEvent: string }).lastUserEvent).toBe('end');
	});

	it('does not trigger wrap-correction on emacs.moveDown even when offset difference is 1', () => {
		const plugin = makePlugin();
		const view = makeView(
			{
				'10:-1': { top: 0, bottom: 20, left: 50, right: 58 },
				'11:-1': { top: 20, bottom: 40, left: 50, right: 58 },
				'11:1': { top: 20, bottom: 40, left: 50, right: 58 }
			},
			11,
			-1
		);

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 10, -1, 11, -1, ['emacs.moveDown']));

		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
	});

	it('cleans up wrap state and does not dispatch corrections when landing on blank lines', () => {
		const plugin = makePlugin();
		plugin.blockWrapState = { logicalPos: 10, showPos: 10, assoc: 1 };
		(plugin as { lastUserEvent: string }).lastUserEvent = 'home';
		const view = makeView({}, 0, -1);
		view.state.doc.lineAt = () => ({ from: 0, to: 0, number: 1, text: '' });

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 10, 1, 0, -1));

		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
		expect((plugin as { lastUserEvent: string }).lastUserEvent).toBe('');
	});

	it('ignores external programmatic selection transactions like select.steadyLinks', () => {
		const plugin = makePlugin();
		const view = makeView({}, 50, -1);

		const navCorrection = getNavCorrection(plugin);
		navCorrection(makeUpdate(view, 10, -1, 50, -1, ['select.steadyLinks']));

		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
	});

	it('isSoftWrap returns false at line start (pos === line.from) even if coordsBefore and coordsAfter differ', () => {
		const coordsAtPos = vi.fn((pos: number, assoc?: number) => {
			if (assoc === -1) return { top: 0, bottom: 20, left: 100, right: 100 };
			return { top: 20, bottom: 40, left: 0, right: 8 };
		});
		const view = {
			state: {
				doc: {
					lineAt: (pos: number) => ({ from: 10, to: 30, number: 2, text: 'some line' }),
				},
			},
			coordsAtPos,
			defaultLineHeight: 20,
		} as unknown as Parameters<typeof isSoftWrap>[0];

		// At column 0 of line 2: pos === line.from (10)
		expect(isSoftWrap(view, 10)).toBe(false);
		// At line end: pos === line.to (30)
		expect(isSoftWrap(view, 30)).toBe(false);
	});

	it('does not dispatch wrap-correction when moving from blank line (delta=1) to next line start', () => {
		const plugin = makePlugin();
		// Line 1: blank line (0..0, length 0, ends with newline at offset 0)
		// Line 2: next line starts at offset 1
		const view = makeView({}, 1, -1);
		view.state.doc.lineAt = (pos: number) => {
			if (pos === 0) return { from: 0, to: 0, number: 1, text: '' };
			return { from: 1, to: 40, number: 2, text: '[[Note-05|Standalone Line Link]]' };
		};

		const navCorrection = getNavCorrection(plugin);
		// oldHead = 0 (blank line), newHead = 1 (column 0 of line 2)
		navCorrection(makeUpdate(view, 0, -1, 1, -1));

		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
	});
});

