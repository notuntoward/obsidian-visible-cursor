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

import VisibleCursorPlugin from '../main';

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

	it('does not dispatch correction for emacs.moveToStart jumps', () => {
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
		navCorrection(makeUpdate(view, 40, -1, 8, -1, ['emacs.moveToStart']));

		expect(view.dispatch).not.toHaveBeenCalled();
		expect(plugin.blockWrapState).toBeNull();
	});
});
