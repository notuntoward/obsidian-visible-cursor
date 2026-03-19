import { Plugin, MarkdownView } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, keymap } from '@codemirror/view';
import { EditorSelection, Prec } from '@codemirror/state';
import { VisibleCursorPluginSettings, DEFAULT_SETTINGS, VisibleCursorSettingTab } from './settings';
import { ColorProvider } from './src/services/colorProvider';
import { FlashScheduler, type FlashState } from './src/services/flashScheduler';
import { FlashRenderer } from './src/services/flashRenderer';

/**
 * Custom cursor rendering, mirroring the codemirror-emacs BlockCursorPlugin pattern.
 *
 * Creates a cursor layer div in view.scrollDOM and positions a cursor element
 * via view.requestMeasure() using view.coordsAtPos() with selection.assoc for
 * correct soft-wrap boundary handling.
 *
 * Coordinate conversion: viewport → scrollDOM-relative
 *   top  = coords.top  - scrollDOM.getBoundingClientRect().top  + scrollDOM.scrollTop
 *   left = coords.left - scrollDOM.getBoundingClientRect().left + scrollDOM.scrollLeft
 */
class CustomCursorViewPlugin {
	private cursorLayer: HTMLElement;
	private cursorEl: HTMLElement | null = null;
	private view: EditorView;
	private plugin: VisibleCursorPlugin;

	constructor(view: EditorView, plugin: VisibleCursorPlugin) {
		this.view = view;
		this.plugin = plugin;

		this.cursorLayer = document.createElement('div');
		this.cursorLayer.className = 'visible-cursor-custom-layer';
		this.cursorLayer.setAttribute('aria-hidden', 'true');
		this.cursorLayer.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible;';
		view.scrollDOM.appendChild(this.cursorLayer);

		view.requestMeasure(this.buildMeasureReq());
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.selectionSet || update.geometryChanged || update.viewportChanged) {
			update.view.requestMeasure(this.buildMeasureReq());
		}
	}

	destroy() {
		this.cursorLayer.remove();
	}

	private buildMeasureReq() {
		const plugin = this.plugin;
		const cursorLayer = this.cursorLayer;

		return {
			key: this,
			read: (view: EditorView): { top: number; left: number; width: number; height: number; color: string } | null => {
				const mode = plugin.settings.customCursorMode;
				if (mode === 'off') return null;
				if (mode === 'flash' && !plugin.flashActive) return null;
				if (!view.hasFocus) return null;

				const sel = view.state.selection.main;
				const pos = sel.head;
				const style = plugin.settings.customCursorStyle;

				// Use selection.assoc to pick the correct visual line at soft-wrap boundaries.
				// For block cursor this is the key mechanism: sel.assoc of -1 places the
				// block at the start of the continuation line; assoc of +1 places it at the
				// end of the wrapped line (over the trailing space).  The keymap handlers in
				// createBlockCursorNavFilter() manage the assoc transitions when arrowing
				// across soft-wrap boundaries, mirroring GNU Emacs block cursor behaviour.
				// Bar / thinbar cursors use the same mechanism (standard Obsidian behaviour).
				const coords = view.coordsAtPos(pos, sel.assoc || -1);
				if (!coords) return null;

				// Convert viewport-relative → scrollDOM-relative coordinates
				const scrollDOM = view.scrollDOM;
				const scrollRect = scrollDOM.getBoundingClientRect();

				// For block cursor: measure the actual character width by comparing
				// coordsAtPos(pos, assoc) with coordsAtPos(pos+1, -1), mirroring
				// codemirror-emacs's measureCursor approach.
				let charWidth = 0;
				if (style === 'block') {
					const doc = view.state.doc;
					const pos1 = Math.min(doc.length, pos + 1);
					const rightCoords = pos1 > pos ? view.coordsAtPos(pos1, -1) : null;
					if (rightCoords && rightCoords.left > coords.left) {
						charWidth = rightCoords.left - coords.left;
					} else {
						// Fallback: use a reasonable character width estimate
						charWidth = view.defaultCharacterWidth || 10;
					}
				}

				return {
					top: coords.top - scrollRect.top + scrollDOM.scrollTop,
					left: coords.left - scrollRect.left + scrollDOM.scrollLeft,
					width: charWidth,  // 0 for bar/thinbar (width handled in write)
					height: coords.bottom - coords.top,
					color: plugin.colorProvider.getColor(plugin.settings).color
				};
			},
			write: (measure: { top: number; left: number; width: number; height: number; color: string } | null) => {
				if (!measure) {
					cursorLayer.style.display = 'none';
					return;
				}
				cursorLayer.style.display = '';

				if (!this.cursorEl) {
					this.cursorEl = document.createElement('div');
					this.cursorEl.className = 'visible-cursor-element';
					cursorLayer.appendChild(this.cursorEl);
				}

				const el = this.cursorEl;
				el.style.position = 'absolute';
				el.style.top = measure.top + 'px';
				el.style.left = measure.left + 'px';
				el.style.height = measure.height + 'px';

				const style = plugin.settings.customCursorStyle;
				if (style === 'bar') {
					el.style.width = '3px';
					el.style.marginLeft = '-1px';
					el.style.backgroundColor = measure.color;
					el.style.border = '';
					el.style.opacity = '';
					el.style.mixBlendMode = '';
				} else if (style === 'thinbar') {
					el.style.width = '2px';
					el.style.backgroundColor = measure.color;
					el.style.border = '';
					el.style.opacity = '';
					el.style.marginLeft = '';
					el.style.mixBlendMode = '';
				} else {
					// block: covers the character cell using the measured character width.
					// mix-blend-mode: difference keeps the character text visible through
					// the highlight (same technique as codemirror-emacs block cursor).
					el.style.width = measure.width > 0 ? measure.width + 'px' : '0.6em';
					el.style.backgroundColor = measure.color;
					el.style.opacity = '0.85';
					el.style.mixBlendMode = 'difference';
					el.style.border = '';
					el.style.marginLeft = '';
				}
			}
		};
	}
}

export default class VisibleCursorPlugin extends Plugin {
	settings: VisibleCursorPluginSettings;
	private styleElement: HTMLStyleElement | null = null;

	private lastViewChange: number = 0;
	private flashTimeout: NodeJS.Timeout | null = null;
	private resetFlashTimeout: NodeJS.Timeout | null = null;
	private scrollDebounceTimer: NodeJS.Timeout | null = null;
	private lastScrollPosition: number = 0;
	flashActive: boolean = false;    // public so CustomCursorViewPlugin can read it
	private clickFenceActive: boolean = false;
	private pendingFlashTrigger: string | null = null;
	private scrollFlashSuppressedUntil: number = 0;
	private boundStartFence: () => void;
	private boundEndFenceSoon: () => void;
	private boundClickEndFence: () => void;

	// Services
	colorProvider: ColorProvider;    // public so CustomCursorViewPlugin can read it
	private flashScheduler: FlashScheduler;
	private flashRenderer: FlashRenderer;

	async onload() {
		await this.loadSettings();

		// Initialize services
		this.colorProvider = new ColorProvider();
		this.flashScheduler = new FlashScheduler();
		this.flashRenderer = new FlashRenderer();

		this.addSettingTab(new VisibleCursorSettingTab(this.app, this));

		const pluginRef = this;

		// Register editor extensions:
		// 1. CustomCursorViewPlugin — codemirror-emacs BlockCursorPlugin pattern
		// 2. domEventHandlers — scroll-triggered flashes
		// 3. blockCursorNavFilter — GNU Emacs soft-wrap boundary navigation for block cursor
		//    (returns an array: [viewTracker ViewPlugin, EditorState.transactionFilter])
		this.registerEditorExtension([
			ViewPlugin.define((view) => new CustomCursorViewPlugin(view, pluginRef)),
			this.createDOMEventHandlers(),
			...this.createBlockCursorNavFilter()
		]);

		requestAnimationFrame(() => requestAnimationFrame(() => this.updateCursorStyles()));

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				requestAnimationFrame(() => this.updateCursorStyles());
				if (this.settings.flashOnWindowChanges) {
					requestAnimationFrame(() => requestAnimationFrame(() => this.scheduleFlash('view-change', false)));
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				if (this.settings.flashOnWindowChanges) {
					requestAnimationFrame(() => requestAnimationFrame(() => this.scheduleFlash('layout-change', false)));
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				this.app.workspace.updateOptions();
				requestAnimationFrame(() => this.updateCursorStyles());
			})
		);

		// Global click fence: raised in capture-phase pointerdown
		this.boundStartFence = () => { this.clickFenceActive = true; };
		this.boundEndFenceSoon = () => { setTimeout(() => { this.clickFenceActive = false; }, 400); };
		this.boundClickEndFence = () => { this.boundEndFenceSoon(); };
		window.addEventListener('pointerdown', this.boundStartFence, { capture: true });
		window.addEventListener('pointerup', this.boundEndFenceSoon, { capture: true });
		window.addEventListener('pointercancel', this.boundEndFenceSoon, { capture: true });
		window.addEventListener('click', this.boundClickEndFence, { capture: true });
	}

	createDOMEventHandlers() {
		const plugin = this;

		return EditorView.domEventHandlers({
			scroll: (event: Event, view: EditorView) => {
				if (!plugin.settings.flashOnWindowScrolls) return false;

				const currentScrollPos = view.scrollDOM.scrollTop;
				const scrollDelta = Math.abs(currentScrollPos - plugin.lastScrollPosition);
				plugin.lastScrollPosition = currentScrollPos;

				const now = Date.now();
				if (plugin.flashActive || now < plugin.scrollFlashSuppressedUntil) {
					plugin.scrollFlashSuppressedUntil = now + 300;
					if (plugin.scrollDebounceTimer) {
						clearTimeout(plugin.scrollDebounceTimer);
						plugin.scrollDebounceTimer = null;
					}
					return false;
				}

				if (plugin.scrollDebounceTimer) {
					clearTimeout(plugin.scrollDebounceTimer);
				}

				const debounceTime = plugin.flashScheduler.getScrollDebounceTime(scrollDelta);
				plugin.scrollDebounceTimer = setTimeout(() => {
					plugin.scheduleFlash('scroll', false);
					plugin.scrollDebounceTimer = null;
				}, debounceTime);

				return false;
			}
		});
	}

	/**
	 * GNU Emacs block cursor navigation filter.
	 *
	 * In GNU Emacs, a block cursor at a soft-wrap boundary works as follows:
	 *   • When the cursor is at the last position of a wrapped line (visually covering
	 *     the trailing space), pressing ArrowRight should NOT advance the document offset
	 *     — it should snap the cursor to the first character of the continuation line
	 *     (same document offset, assoc flipped to -1).
	 *   • From there, ArrowRight advances the document offset to the second character.
	 *   • Pressing ArrowLeft when at start-of-continuation-line (assoc=-1) at a soft-wrap
	 *     boundary snaps back to assoc=+1 (end of wrapped line) without changing offset.
	 *
	 * Implementation: we use a highest-priority keymap so our handlers run BEFORE CM6's
	 * own arrow-key bindings.  This is the only reliable way to intercept before CM6
	 * consumes the event.  coordsAtPos is safe to call here because the DOM is stable
	 * at the point the keymap fires (between layout frames, BEFORE the transaction).
	 *
	 * This filter is only active when customCursorStyle === 'block'.
	 * Bar / thinbar cursors are completely unaffected because the keymap handlers return
	 * false when the block cursor style is not active.
	 */
	createBlockCursorNavFilter() {
		const plugin = this;

		const handleRight = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;
			const sel = view.state.selection.main;
			if (!sel.empty) return false;
			const pos = sel.head;
			const coordsAfter  = view.coordsAtPos(pos, 1);
			const coordsBefore = view.coordsAtPos(pos, -1);
			if (!coordsAfter || !coordsBefore) return false;
			const atSoftWrap = Math.abs(coordsAfter.top - coordsBefore.top) > 1;
			if (!atSoftWrap) return false;

			if (sel.assoc > 0) {
				// At end-of-wrapped-line: snap to start of continuation line
				view.dispatch({ selection: EditorSelection.cursor(pos, -1), scrollIntoView: true });
				return true;
			}
			// assoc <= 0: let CM6 move forward normally (to pos+1)
			return false;
		};

		const handleLeft = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;
			const sel = view.state.selection.main;
			if (!sel.empty) return false;
			const pos = sel.head;
			const coordsAfter  = view.coordsAtPos(pos, 1);
			const coordsBefore = view.coordsAtPos(pos, -1);
			if (!coordsAfter || !coordsBefore) return false;
			const atSoftWrap = Math.abs(coordsAfter.top - coordsBefore.top) > 1;
			if (!atSoftWrap) return false;

			if (sel.assoc < 0) {
				// At start-of-continuation-line: snap back to end of wrapped line
				view.dispatch({ selection: EditorSelection.cursor(pos, 1), scrollIntoView: true });
				return true;
			}
			// assoc >= 0: let CM6 move backward normally (to pos-1)
			return false;
		};

		// Use Prec.highest so our keymap overrides CM6's built-in ArrowRight/Left handlers
		return [
			Prec.highest(keymap.of([
				{ key: 'ArrowRight', run: handleRight },
				{ key: 'ArrowLeft',  run: handleLeft  },
			]))
		];
	}

	scheduleFlash(trigger: string, isMouseClick: boolean) {
		if (isMouseClick) return;

		const state: FlashState = {
			isFenceActive: this.clickFenceActive,
			isFlashActive: this.flashActive,
			hasPendingFlash: !!this.pendingFlashTrigger,
			lastViewChange: this.lastViewChange,
			now: Date.now()
		};

		if (!this.flashScheduler.canScheduleFlash(trigger, state)) return;

		this.lastViewChange = state.now;
		if (this.flashTimeout) {
			clearTimeout(this.flashTimeout);
		}

		this.pendingFlashTrigger = trigger;
		this.flashTimeout = this.flashScheduler.scheduleCallback(() => {
			this.showFlash();
			this.pendingFlashTrigger = null;
		}, 50);
	}

	showFlash() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.editor) return;

		const editorView = (view.editor as any).cm as EditorView;
		if (!editorView) return;

		if (this.scrollDebounceTimer) {
			clearTimeout(this.scrollDebounceTimer);
			this.scrollDebounceTimer = null;
		}

		if (this.settings.lineHighlightMode === 'left') {
			this.showLineFlash(editorView);
		} else if (this.settings.lineHighlightMode === 'centered') {
			this.showCursorCenteredFlash(editorView);
		} else if (this.settings.lineHighlightMode === 'right') {
			this.showLineFlashRightToLeft(editorView);
		}

		this.flashActive = true;
		if (this.settings.customCursorMode === 'flash') {
			document.body.classList.add('visible-cursor-flash-active');
		}

		if (this.resetFlashTimeout) {
			clearTimeout(this.resetFlashTimeout);
		}

		this.resetFlashTimeout = this.flashScheduler.scheduleReset(() => {
			this.flashActive = false;
			if (this.settings.customCursorMode === 'flash') {
				document.body.classList.remove('visible-cursor-flash-active');
			}
		}, this.settings.lineDuration);
	}

	/** Get cursor coords using selection.assoc for correct soft-wrap boundary handling */
	private cursorCoords(editorView: EditorView): { top: number; bottom: number; left: number; right: number } | null {
		const cursor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!cursor) return null;
		const pos = (cursor as any).posToOffset(cursor.getCursor());
		const assoc = editorView.state.selection.main.assoc || -1;
		return editorView.coordsAtPos(pos, assoc);
	}

	showLineFlash(editorView: EditorView) {
		const coords = this.cursorCoords(editorView);
		if (!coords) return;

		const editorElement = editorView.contentDOM;
		const editorRect = editorElement.getBoundingClientRect();
		const lineHeight = editorView.defaultLineHeight;
		const { color, opacity } = this.colorProvider.getColor(this.settings);
		const rgb = this.colorProvider.resolveColorToRgb(color);
		const fontSize = parseFloat(getComputedStyle(editorElement).fontSize) || 16;
		const charWidth = fontSize * 0.6;
		const highlightDistance = this.settings.flashSize * charWidth;
		const highlightPercent = Math.min(100, (highlightDistance / editorRect.width) * 100);

		const colorStop = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
		const cssText = `
			position: fixed;
			left: ${editorRect.left}px;
			top: ${coords.top}px;
			width: ${editorRect.width}px;
			height: ${lineHeight}px;
			background: linear-gradient(to right,
				${colorStop} 0%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.5}) ${highlightPercent * 0.5}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) ${highlightPercent}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%
			);
			pointer-events: none;
			z-index: 1;
			animation: flash-line-fade ${this.settings.lineDuration}ms ease-out;
		`;
		this.flashRenderer.render('left', cssText, this.settings.lineDuration);
	}

	showLineFlashRightToLeft(editorView: EditorView) {
		const coords = this.cursorCoords(editorView);
		if (!coords) return;

		const editorElement = editorView.contentDOM;
		const editorRect = editorElement.getBoundingClientRect();
		const lineHeight = editorView.defaultLineHeight;
		const { color, opacity } = this.colorProvider.getColor(this.settings);
		const rgb = this.colorProvider.resolveColorToRgb(color);
		const fontSize = parseFloat(getComputedStyle(editorElement).fontSize) || 16;
		const charWidth = fontSize * 0.6;
		const highlightDistance = this.settings.flashSize * charWidth;
		const highlightPercent = Math.min(100, (highlightDistance / editorRect.width) * 100);

		const colorStop = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
		const cssText = `
			position: fixed;
			left: ${editorRect.left}px;
			top: ${coords.top}px;
			width: ${editorRect.width}px;
			height: ${lineHeight}px;
			background: linear-gradient(to left,
				${colorStop} 0%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.5}) ${highlightPercent * 0.5}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) ${highlightPercent}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%
			);
			pointer-events: none;
			z-index: 1;
			animation: flash-line-fade ${this.settings.lineDuration}ms ease-out;
		`;
		this.flashRenderer.render('right', cssText, this.settings.lineDuration);
	}

	showCursorCenteredFlash(editorView: EditorView) {
		const coords = this.cursorCoords(editorView);
		if (!coords) return;

		const editorElement = editorView.contentDOM;
		const editorRect = editorElement.getBoundingClientRect();
		const lineHeight = editorView.defaultLineHeight;
		const cursorX = coords.left - editorRect.left;
		const editorWidth = editorRect.width;
		const cursorPercent = (cursorX / editorWidth) * 100;
		const { color, opacity } = this.colorProvider.getColor(this.settings);
		const rgb = this.colorProvider.resolveColorToRgb(color);

		const peakOpacity = opacity;
		const fadeOpacity = opacity * 0.75;
		const fontSize = parseFloat(getComputedStyle(editorElement).fontSize) || 16;
		const charWidth = fontSize * 0.6;
		const spreadDistance = (this.settings.flashSize / 2) * charWidth;
		const spreadPercent = (spreadDistance / editorRect.width) * 100;
		const leftEdge = Math.max(0, cursorPercent - spreadPercent);
		const rightEdge = Math.min(100, cursorPercent + spreadPercent);

		const cssText = `
			position: fixed;
			left: ${editorRect.left}px;
			top: ${coords.top}px;
			width: ${editorRect.width}px;
			height: ${lineHeight}px;
			background: linear-gradient(to right,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 0%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) ${leftEdge}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fadeOpacity}) ${(leftEdge + cursorPercent) / 2}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${peakOpacity}) ${cursorPercent}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fadeOpacity}) ${(cursorPercent + rightEdge) / 2}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) ${rightEdge}%,
				rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%
			);
			pointer-events: none;
			z-index: 1;
			animation: flash-line-fade ${this.settings.lineDuration}ms ease-out;
		`;
		this.flashRenderer.render('centered', cssText, this.settings.lineDuration);
	}

	updateCursorStyles(): void {
		if (this.styleElement) {
			this.styleElement.remove();
			this.styleElement = null;
		}

		const mode = this.settings.customCursorMode;

		this.styleElement = document.createElement('style');
		this.styleElement.id = 'cursor-flash-dynamic-styles';

		if (mode === 'off') {
			document.head.appendChild(this.styleElement);
			return;
		}

		// Hide native browser caret so it doesn't appear alongside our custom cursor.
		// In 'flash' mode, only suppress the caret during active flash windows.
		const caretScope = mode === 'flash'
			? 'body.visible-cursor-flash-active .cm-editor.cm-focused .cm-content'
			: '.cm-editor.cm-focused .cm-content';

		this.styleElement.textContent = `
${caretScope} {
	caret-color: transparent !important;
}`;
		document.head.appendChild(this.styleElement);
	}

	refreshDecorations() {
		this.updateCursorStyles();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		const anySettings = this.settings as any;
		if (anySettings.blockCursorMode !== undefined && anySettings.customCursorMode === undefined) {
			anySettings.customCursorMode = anySettings.blockCursorMode;
			delete anySettings.blockCursorMode;
		}
		if (anySettings.blockCursorStyle !== undefined && anySettings.customCursorStyle === undefined) {
			anySettings.customCursorStyle = anySettings.blockCursorStyle;
			delete anySettings.blockCursorStyle;
		}
		if (anySettings.customCursorStyle === 'thick-vertical') {
			anySettings.customCursorStyle = 'bar';
		}
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		if (this.styleElement) this.styleElement.remove();
		document.body.classList.remove('visible-cursor-flash-active');
		if (this.flashTimeout) clearTimeout(this.flashTimeout);
		if (this.resetFlashTimeout) clearTimeout(this.resetFlashTimeout);
		if (this.scrollDebounceTimer) clearTimeout(this.scrollDebounceTimer);
		window.removeEventListener('pointerdown', this.boundStartFence, { capture: true });
		window.removeEventListener('pointerup', this.boundEndFenceSoon, { capture: true });
		window.removeEventListener('pointercancel', this.boundEndFenceSoon, { capture: true });
		window.removeEventListener('click', this.boundClickEndFence, { capture: true });
	}
}
