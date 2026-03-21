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

				// For the block cursor, createBlockCursorNavFilter() tracks state via
				// plugin._blockWrapState.  When set to {logicalPos, showPos, assoc}:
				//   logicalPos = the actual cursor doc position
				//   showPos    = the doc position to use for coordinate lookup
				//   assoc      = the side to use for coordsAtPos
				// Bar / thinbar use sel.assoc as-is (standard Obsidian behaviour).
				let visualPos: number = pos;
				let assocForCoords: number;
				if (style === 'block') {
					const wrapState = (plugin as any)._blockWrapState?.() as
						{ logicalPos: number; showPos: number; assoc: 1 | -1 } | null;
					if (wrapState && wrapState.logicalPos === pos) {
						// Explicit wrapState override from createBlockCursorNavFilter():
						// show block at the START of the continuation line (assoc=+1).
						// This fires when a single-step ArrowRight arrived at the soft-wrap
						// boundary (set by navCorrection updateListener, which runs synchronously
						// before requestMeasure processes, so this branch always fires first
						// for ArrowRight).
						visualPos = wrapState.showPos;
						assocForCoords = wrapState.assoc;
					} else {
						// Default: sel.assoc.  End key, click, multi-char jumps, etc. all
						// arrive here with whatever assoc CM6 assigned — respected as-is.
						assocForCoords = sel.assoc || -1;
					}
				} else {
					// Bar / thinbar: use sel.assoc directly (standard Obsidian behaviour)
					assocForCoords = sel.assoc || -1;
				}

				const coords = view.coordsAtPos(visualPos, assocForCoords as 1 | -1);
				if (!coords) return null;

				// Convert viewport-relative → scrollDOM-relative coordinates
				const scrollDOM = view.scrollDOM;
				const scrollRect = scrollDOM.getBoundingClientRect();

				// For block cursor: measure the character width.
				// coordsAtPos(visualPos, assocForCoords) gives the left edge of the char.
				// coordsAtPos(visualPos+1, +1) gives the left edge of the NEXT char, which
				// equals the right edge of the current char in LTR text.
				let charWidth = 0;
				if (style === 'block') {
					const doc = view.state.doc;
					const vpos1 = Math.min(doc.length, visualPos + 1);
					const rightCoords = vpos1 > visualPos ? view.coordsAtPos(vpos1, 1) : null;
					if (rightCoords && rightCoords.left > coords.left) {
						charWidth = rightCoords.left - coords.left;
					} else {
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
	 * GNU Emacs block cursor navigation at soft-wrap boundaries.
	 *
	 * Diagnostic data from testing (coordsAtPos) at soft-wrap boundary P
	 * (the first character of the continuation line in Obsidian/CM6):
	 *   coordsAtPos(P, -1).top = visual line 1 top  ← END of wrapped line
	 *   coordsAtPos(P, +1).top = visual line 2 top  ← START of continuation line
	 *
	 * The `buildMeasureReq` read function already handles the visual positioning:
	 * at a soft-wrap boundary with sel.assoc ≤ 0 (CM6's default after a rightward
	 * move), it overrides to assoc=+1 so the block appears on line 2.
	 *
	 * This filter only needs to handle one additional case:
	 *   • When the cursor arrives at P via a rightward keyboard move, block shows
	 *     on line 2 immediately.  Pressing → AGAIN should advance to P+1 (second
	 *     char of continuation line), not stay at P.
	 *   • We use blockWrapState={logicalPos:P, showPos:P, assoc:+1} as a flag set
	 *     by the updateListener after rightward arrival; handleRight sees it and
	 *     allows the advance.
	 *
	 * Bar / thinbar cursors are completely unaffected.
	 */
	createBlockCursorNavFilter() {
		const plugin = this;

		// Set by the updateListener when a rightward keyboard move arrives at a
		// soft-wrap boundary P.  Cleared by handleRight when advancing past P,
		// and by the updateListener when the cursor moves elsewhere.
		let blockWrapState: { logicalPos: number; showPos: number; assoc: 1 | -1 } | null = null;

		// Expose to buildMeasureReq via plugin instance
		(plugin as any)._blockWrapState = () => blockWrapState;

		// Inter-plugin API: expose _visibleCursorForwardChar on the window object so
		// that other plugins can integrate with the block cursor soft-wrap behavior.
		// Usage in another plugin:
		//   const helper = (window as any)._visibleCursorForwardChar;
		//   if (helper && helper(view)) return; // skip own advance
		//   // ...do own advance...
		// Returns true if the forward-char was handled (block showed first char of
		// continuation line, caller should NOT advance further this keypress).
		// Returns false if the caller should proceed with its normal advance.
		(window as any)._visibleCursorForwardChar = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;
			const sel = view.state.selection.main;
			if (!sel.empty) return false;
			const pos = sel.head;

			if (blockWrapState && blockWrapState.logicalPos === pos) {
				// Already showing line-2-start; allow caller's advance (P+1)
				blockWrapState = null;
				return false;
			}

			// Check if at soft-wrap boundary (reliable here since called at render time
			// or in response to a user action, not inside a transaction)
			const a = view.coordsAtPos(pos, 1);
			const b = view.coordsAtPos(pos, -1);
			if (a && b && Math.abs(a.top - b.top) > 1) {
				// At wrap boundary — snap to line-2-start and suppress caller's advance
				blockWrapState = { logicalPos: pos, showPos: pos, assoc: 1 };
				view.dispatch({ selection: EditorSelection.cursor(pos, 1) });
				return true; // caller should NOT advance
			}

			return false; // not at wrap boundary, caller proceeds normally
		};

		// Detects whether a document position sits at a soft-wrap boundary.
		const isSoftWrap = (view: EditorView, pos: number): boolean => {
			const line = view.state.doc.lineAt(pos);
			
			// 1. If we are at the end of a physical line (\n), it is NOT a soft wrap.
			if (pos === line.to) return false;

			// 2. Check if the vertical position changes at the same logical index.
			const coordsBefore = view.coordsAtPos(pos, -1);
			const coordsAfter = view.coordsAtPos(pos, 1);
			
			if (!coordsBefore || !coordsAfter) return false;
			
			// If the top coordinate differs, the line has wrapped visually.
			return Math.abs(coordsBefore.top - coordsAfter.top) > 1;
		};

		// ── HandleRight ─────────────────────────────────────────────────────────
		// If blockWrapState is active for the current pos (set by updateListener on
		// rightward arrival at wrap boundary P): the block is already showing line-2
		// start.  Clear the state and let CM6 advance to P+1.
		//
		// NEW: Also handles the case where cursor landed at a soft-wrap boundary
		// via End key, mouse click, or other jump (assoc=-1).  Pressing → should
		// snap to assoc=1 (show first char of next line) instead of advancing to P+1.
		const handleRight = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;
			const sel = view.state.selection.main;
			if (!sel.empty) return false;
			const pos = sel.head;

			if (blockWrapState && blockWrapState.logicalPos === pos) {
				// Block is showing line-2-start; this press advances to P+1
				blockWrapState = null;
				return false;  // let CM6 advance normally
			}

			// NEW: Check if we're at a soft-wrap boundary with assoc !== 1
			// (e.g., after End key or mouse click).  Snap to assoc=1 instead of advancing.
			if (sel.assoc !== 1 && isSoftWrap(view, pos)) {
				blockWrapState = { logicalPos: pos, showPos: pos, assoc: 1 };
				view.dispatch({ selection: EditorSelection.cursor(pos, 1) });
				return true;  // handled: don't let CM6 advance
			}

			blockWrapState = null;
			return false;
		};

		// ── HandleLeft ───────────────────────────────────────────────────────────
		// Clear blockWrapState on any leftward press so the visual reverts to normal
		// sel.assoc-based rendering.  CM6 naturally handles the visual correctly
		// when moving left through the boundary (lands at P with assoc=+1 showing
		// the first char of line 2, then retreats to P-1 on the next ←).
		const handleLeft = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;
			if (!view.state.selection.main.empty) return false;
			blockWrapState = null;
			return false;
		};

		// ── UpdateListener ─────────────────────────────────────────────────────
		// When a rightward keyboard move arrives at soft-wrap boundary P, set
		// blockWrapState so the advance-logic in handleRight is armed for the
		// next → press.  Also clears stale state when cursor moves elsewhere.
		const navCorrection = EditorView.updateListener.of((update: ViewUpdate) => {
			if (!update.selectionSet && !update.docChanged) return;
			const sel = update.state.selection.main;

			// Clear state if the cursor moves away
			if (blockWrapState !== null) {
				if (update.docChanged || !sel.empty || sel.head !== blockWrapState.logicalPos) {
					blockWrapState = null;
				}
			}

			if (blockWrapState !== null) return;
			if (!update.selectionSet || update.docChanged) return;
			if (plugin.settings.customCursorStyle !== 'block') return;
			if (!sel.empty) return;

			const pos = sel.head;
			const oldSel = update.startState.selection.main;

			// Skip manual selection jumps via mouse
			if (update.transactions.some(t => t.isUserEvent('select.pointer'))) return;

			// ONLY intercept if the user is moving exactly 1 character forward (Right Arrow)
			// This allows the "End" key to land at assoc: -1 (end of current line) normally.
			// The resulting dispatch has pos - oldSel.head = 0, so this won't recurse.
			if (pos - oldSel.head === 1 && isSoftWrap(update.view, pos)) {
				// "Arm" the wrap state and force association to the next visual line
				blockWrapState = { logicalPos: pos, showPos: pos, assoc: 1 };
				update.view.dispatch({
					selection: EditorSelection.cursor(pos, 1)
				});
			}
		});

		return [
			Prec.highest(keymap.of([
				{ key: 'ArrowRight', run: handleRight },
				{ key: 'ArrowLeft',  run: handleLeft  },
			])),
			navCorrection
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
		delete (window as any)._visibleCursorForwardChar;
	}
}
