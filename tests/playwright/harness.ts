import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { CustomCursorViewPlugin } from '../../main';
import { DEFAULT_SETTINGS, type VisibleCursorPluginSettings } from '../../settings';
import { ColorProvider } from '../../src/services/colorProvider';
import type { VisibleCursorHarness } from './harnessTypes';

document.body.classList.add('theme-dark');

const root = document.createElement('div');
root.className = 'markdown-source-view is-live-preview visible-cursor-harness';
document.body.appendChild(root);

const editorHost = document.createElement('div');
editorHost.className = 'cm-editor-host';
root.appendChild(editorHost);

// Minimal plugin-like stub that CustomCursorViewPlugin reads from.
// Avoids needing full Obsidian Plugin lifecycle.
function createPluginStub() {
	const settings: VisibleCursorPluginSettings = {
		...DEFAULT_SETTINGS,
		customCursorMode: 'always',
		customCursorStyle: 'block'
	};

	return {
		settings,
		debugCursorDiagnostics: false,
		flashActive: true,
		isComposing: false,
		blockWrapState: null as null | { logicalPos: number; showPos: number; assoc: 1 | -1 },
		hiddenBoundaryRenderState: null as null | { logicalPos: number; showPos: number; assoc: 1 | -1 },
		colorProvider: new ColorProvider()
	};
}

let pluginStub = createPluginStub();
let view = createView('Before\n[[test-notes/Note-09.md#Note Nine |Note Nine]]\nAfter', 0);

function createView(doc: string, cursorPos: number): EditorView {
	pluginStub = createPluginStub();
	const stub = pluginStub;

	const cursorExtension = ViewPlugin.define(
		(v: EditorView) => new CustomCursorViewPlugin(v, stub as never)
	);

	const state = EditorState.create({
		doc,
		selection: EditorSelection.cursor(cursorPos),
		extensions: [EditorView.lineWrapping, cursorExtension]
	});

	const editorView = new EditorView({
		state,
		parent: editorHost
	});

	return editorView;
}

function replaceView(doc: string, cursorPos = 0): void {
	view.destroy();
	view = createView(doc, cursorPos);
	view.focus();
}

function rectForSelector(selector: string): { top: number; left: number; width: number; height: number } | null {
	const element = view.scrollDOM.querySelector(selector) as HTMLElement | null;
	if (!element) return null;
	const rect = element.getBoundingClientRect();
	return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

const harness: VisibleCursorHarness = {
	setDoc(doc: string, cursorPos = 0) {
		replaceView(doc, cursorPos);
	},
	setCursor(pos: number) {
		view.dispatch({
			selection: EditorSelection.cursor(pos),
			scrollIntoView: true
		});
		view.focus();
	},
	getDoc() {
		return view.state.doc.toString();
	},
	getCursor() {
		const sel = view.state.selection.main;
		return { head: sel.head, assoc: sel.assoc };
	},
	async pressKey(key: string) {
		view.focus();
		const event = new KeyboardEvent('keydown', { key, bubbles: true });
		view.dom.dispatchEvent(event);
		await new Promise(r => setTimeout(r, 50));
	},
	getCustomCursorRect() {
		return rectForSelector('.visible-cursor-element');
	},
	getNativeCursorRect() {
		return rectForSelector('.cm-cursor');
	},
	getLineText(lineNumber: number) {
		const line = view.dom.querySelectorAll('.cm-line')[lineNumber - 1] as HTMLElement | undefined;
		return line?.textContent ?? null;
	},
	getSelectionTextAround(pos: number, span = 8) {
		const from = Math.max(0, pos - span);
		const to = Math.min(view.state.doc.length, pos + span);
		return view.state.doc.sliceString(from, to);
	},
	getDefaultCharWidth() {
		return view.defaultCharacterWidth;
	},
	destroy() {
		view.destroy();
	}
};

window.__visibleCursorHarness = harness;
view.focus();
