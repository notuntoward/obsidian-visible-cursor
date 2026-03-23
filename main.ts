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
			read: (view: EditorView): { top: number; left: number; width: number; height: number; color: string; char: string; contrastColor: string; fontStyle: string; fontWeight: string; fontSize: string; fontFamily: string } | null => {
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
				let char = '';
				let fontStyle = 'inherit';
				let fontWeight = 'inherit';
				let fontSize = 'inherit';
				let fontFamily = 'inherit';
				let originalColor = '';

				if (style === 'block') {
					const doc = view.state.doc;
					
					let isEndOfVisualLine = false;
					if (assocForCoords === -1 && visualPos < doc.length) {
						const coordsBefore = view.coordsAtPos(visualPos, -1);
						const coordsAfter = view.coordsAtPos(visualPos, 1);
						if (coordsBefore && coordsAfter && Math.abs(coordsBefore.top - coordsAfter.top) > 1) {
							isEndOfVisualLine = true;
						}
					}
					
					if (visualPos < doc.length) {
						const line = view.state.doc.lineAt(visualPos);
						if (visualPos === line.to || isEndOfVisualLine) {
							char = ' ';
						} else {
							const text = line.text;
							const offset = visualPos - line.from;
							const codePoint = text.codePointAt(offset);
							if (codePoint !== undefined) {
								char = String.fromCodePoint(codePoint);
							} else {
								char = ' ';
							}
						}
					} else {
						char = ' ';
					}

					const vpos1 = Math.min(doc.length, visualPos + char.length);
					const rightCoords = vpos1 > visualPos ? view.coordsAtPos(vpos1, 1) : null;
					if (rightCoords && rightCoords.left > coords.left && !isEndOfVisualLine) {
						charWidth = rightCoords.left - coords.left;
					} else {
						charWidth = view.defaultCharacterWidth || 10;
					}

					if (char !== ' ') {
						// Try to get the font properties of the element under the cursor
						// We use coords.left + 1 and the vertical center to reliably hit the text span
						const el = document.elementFromPoint(coords.left + 1, coords.top + (coords.bottom - coords.top) / 2);
						if (el && el.nodeType === Node.ELEMENT_NODE) {
							const computed = getComputedStyle(el);
							fontStyle = computed.fontStyle;
							fontWeight = computed.fontWeight;
							fontSize = computed.fontSize;
							fontFamily = computed.fontFamily;
							originalColor = computed.color;
						}
					}
				}

				const cursorColor = plugin.colorProvider.getColor(plugin.settings).color;
				let contrastColor = '';
				if (style === 'block') {
					contrastColor = plugin.colorProvider.getContrastColor(cursorColor, originalColor);
				}

				return {
					top: coords.top - scrollRect.top + scrollDOM.scrollTop,
					left: coords.left - scrollRect.left + scrollDOM.scrollLeft,
					width: charWidth,  // 0 for bar/thinbar (width handled in write)
					height: coords.bottom - coords.top,
					color: cursorColor,
					char: char,
					contrastColor: contrastColor,
					fontStyle,
					fontWeight,
					fontSize,
					fontFamily
				};
			},
			write: (measure: { top: number; left: number; width: number; height: number; color: string; char: string; contrastColor: string; fontStyle: string; fontWeight: string; fontSize: string; fontFamily: string } | null) => {
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
					el.textContent = '';
				} else if (style === 'thinbar') {
					el.style.width = '2px';
					el.style.backgroundColor = measure.color;
					el.style.border = '';
					el.style.opacity = '';
					el.style.marginLeft = '';
					el.style.mixBlendMode = '';
					el.textContent = '';
				} else {
					// block: covers the character cell using the measured character width.
					el.style.width = measure.width > 0 ? measure.width + 'px' : '0.6em';
					el.style.backgroundColor = measure.color;
					el.style.opacity = '1';
					el.style.mixBlendMode = 'normal';
					el.style.border = '';
					el.style.marginLeft = '';
					
					// Render the character inside the cursor for perfect contrast
					el.textContent = measure.char;
					el.style.color = measure.contrastColor;
					el.style.display = 'flex';
					el.style.alignItems = 'center';
					el.style.justifyContent = 'flex-start';
					el.style.overflow = 'hidden';
					el.style.whiteSpace = 'pre';
					// Match the font of the editor and the specific character
					el.style.fontStyle = measure.fontStyle;
					el.style.fontWeight = measure.fontWeight;
					el.style.fontSize = measure.fontSize;
					el.style.fontFamily = measure.fontFamily;
					el.style.lineHeight = measure.height + 'px';
					el.style.setProperty('tab-size', 'inherit');
				}
			}
		};
	}
}

export default class VisibleCursorPlugin extends Plugin {
	settings: VisibleCursorPluginSettings;
	private styleElement: HTMLStyleElement | null = null;
	lastKey: string = '';

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
	private boundKeydown: (e: KeyboardEvent) => void;

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
				this.colorProvider.clearCache();
				requestAnimationFrame(() => this.updateCursorStyles());
			})
		);

		// Global click fence: raised in capture-phase pointerdown
		this.boundStartFence = () => { this.clickFenceActive = true; };
		this.boundEndFenceSoon = () => { setTimeout(() => { this.clickFenceActive = false; }, 400); };
		this.boundClickEndFence = () => { this.boundEndFenceSoon(); };
		this.boundKeydown = (e: KeyboardEvent) => { this.lastKey = e.key; };
		window.addEventListener('pointerdown', this.boundStartFence, { capture: true });
		window.addEventListener('pointerup', this.boundEndFenceSoon, { capture: true });
		window.addEventListener('pointercancel', this.boundEndFenceSoon, { capture: true });
		window.addEventListener('click', this.boundClickEndFence, { capture: true });
		window.addEventListener('keydown', this.boundKeydown, { capture: true });
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
	 * This filter handles:
	 *   • ArrowRight: When the cursor arrives at P via a rightward keyboard move,
	 *     block shows on line 2 immediately. Pressing → AGAIN should advance to P+1
	 *     (second char of continuation line), not stay at P.
	 *   • ArrowDown: When the block cursor is visually shown at the start of a
	 *     wrapped continuation line (assoc=1 at soft-wrap boundary), Down should
	 *     use that visual x-position as the anchor for vertical movement, rather
	 *     than the underlying logical position.
	 *
	 * Bar / thinbar cursors are completely unaffected.
	 */
	createBlockCursorNavFilter() {
		const plugin = this;

		let blockWrapState: { logicalPos: number; showPos: number; assoc: 1 | -1 } | null = null;
		let pendingDownFromWrapPos: number | null = null;

		// Expose to buildMeasureReq via plugin instance
		(plugin as any)._blockWrapState = () => blockWrapState;

		// Inter-plugin API: expose _visibleCursorForwardChar on the window object so
		// that other plugins can integrate with the block cursor soft-wrap behavior.
		(window as any)._visibleCursorForwardChar = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;

			const sel = view.state.selection.main;
			if (!sel.empty) return false;

			const pos = sel.head;

			if (blockWrapState && blockWrapState.logicalPos === pos) {
				blockWrapState = null;
				return false;
			}

			const a = view.coordsAtPos(pos, 1);
			const b = view.coordsAtPos(pos, -1);
			if (a && b && Math.abs(a.top - b.top) > 1) {
				blockWrapState = { logicalPos: pos, showPos: pos, assoc: 1 };
				pendingDownFromWrapPos = pos;
				view.dispatch({ selection: EditorSelection.cursor(pos, 1) });
				return true;
			}

			return false;
		};

		const isSoftWrap = (view: EditorView, pos: number): boolean => {
			const line = view.state.doc.lineAt(pos);

			if (pos === line.to) return false;

			const coordsBefore = view.coordsAtPos(pos, -1);
			const coordsAfter = view.coordsAtPos(pos, 1);

			if (!coordsBefore || !coordsAfter) return false;

			return Math.abs(coordsBefore.top - coordsAfter.top) > 1;
		};

		const findStartOfNextVisualLineFromWrap = (
			view: EditorView,
			pos: number
		): { pos: number; assoc: 1 | -1 } | null => {
			const doc = view.state.doc;
			const line = doc.lineAt(pos);

			const current = view.coordsAtPos(pos, 1);
			if (!current) return null;

			// First: look for the first position later in the SAME logical line
			// whose visual top is below the current wrapped segment.
			for (let p = pos + 1; p <= line.to; p++) {
				const c = view.coordsAtPos(p, 1);
				if (!c) continue;

				if (c.top > current.top + 1) {
					return { pos: p, assoc: 1 };
				}
			}

			// If there is no lower visual segment in this logical line, fall back to
			// the start of the next physical line.
			if (line.number < doc.lines) {
				const nextLine = doc.line(line.number + 1);
				return { pos: nextLine.from, assoc: 1 };
			}

			return null;
		};

		const findStartOfPreviousVisualLineFromWrap = (
			view: EditorView,
			pos: number
		): { pos: number; isSoftWrap: boolean } | null => {
			const doc = view.state.doc;
			const line = doc.lineAt(pos);

			if (pos === line.from) {
				// At the start of a logical line → go to the previous logical line's
				// last visual segment.
				if (line.number <= 1) return null; // top of document
				const prevLine = doc.line(line.number - 1);

				const endCoords = view.coordsAtPos(prevLine.to, -1);
				if (!endCoords) return { pos: prevLine.from, isSoftWrap: false };

				const endTop = endCoords.top;
				for (let p = prevLine.to - 1; p >= prevLine.from; p--) {
					const c = view.coordsAtPos(p, 1);
					if (c && c.top < endTop - 1) {
						// p+1 is the start of the last visual segment of prevLine
						return { pos: p + 1, isSoftWrap: true };
					}
				}
				return { pos: prevLine.from, isSoftWrap: false };
			}

			// Within a wrapped logical line: find the start of the visual line
			// above the one that starts at `pos`.
			// coordsAtPos(pos, -1) gives the end of the previous visual line.
			const aboveCoords = view.coordsAtPos(pos, -1);
			if (!aboveCoords) return null;
			const aboveTop = aboveCoords.top;

			// Scan backward with assoc=1; when coordsAtPos(p,1).top drops below
			// aboveTop, p+1 is where the "above" visual line begins.
			for (let p = pos - 1; p >= line.from; p--) {
				const c = view.coordsAtPos(p, 1);
				if (!c) continue;
				if (c.top < aboveTop - 1) {
					return { pos: p + 1, isSoftWrap: true };
				}
			}

			// No earlier wrap: the visual line starts at the logical-line start
			return { pos: line.from, isSoftWrap: false };
		};

		const handleRight = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;

			const sel = view.state.selection.main;
			if (!sel.empty) return false;

			const pos = sel.head;

			if (blockWrapState && blockWrapState.logicalPos === pos) {
				blockWrapState = null;
				return false;
			}

			if (sel.assoc !== 1 && isSoftWrap(view, pos)) {
				blockWrapState = { logicalPos: pos, showPos: pos, assoc: 1 };
				pendingDownFromWrapPos = pos;
				view.dispatch({ selection: EditorSelection.cursor(pos, 1) });
				return true;
			}

			blockWrapState = null;
			return false;
		};

		const handleLeft = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;
			if (!view.state.selection.main.empty) return false;

			blockWrapState = null;
			pendingDownFromWrapPos = null;
			return false;
		};

		const handleDown = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;

			const sel = view.state.selection.main;
			if (!sel.empty) return false;

			const pos = sel.head;

			const wrapStateForPos =
				blockWrapState &&
				blockWrapState.logicalPos === pos &&
				blockWrapState.assoc === 1
					? blockWrapState
					: null;

			const allowWrappedDown =
				!!wrapStateForPos || pendingDownFromWrapPos === pos;

			console.log('VISIBLE-CURSOR handleDown', {
				pos,
				selAssoc: sel.assoc,
				blockWrapState,
				pendingDownFromWrapPos,
				allowWrappedDown
			});

			if (!allowWrappedDown) {
				return false;
			}

			const target = findStartOfNextVisualLineFromWrap(view, pos);
			pendingDownFromWrapPos = null;

			if (!target) {
				blockWrapState = null;
				return false;
			}

			// Set blockWrapState for the target position so the renderer shows
			// the cursor at the start of the continuation line (assoc=1),
			// just like handleRight() does.
			blockWrapState = { logicalPos: target.pos, showPos: target.pos, assoc: 1 };
			view.dispatch({
				selection: EditorSelection.cursor(target.pos, 1),
				scrollIntoView: true
			});
			return true;
		};

		const handleUp = (view: EditorView): boolean => {
			if (plugin.settings.customCursorStyle !== 'block') return false;

			const sel = view.state.selection.main;
			if (!sel.empty) return false;

			const pos = sel.head;

			// CASE 1: Cursor is at a known wrap boundary (blockWrapState active,
			// visually at the start of a continuation line).  Compute the target
			// ourselves — symmetric to handleDown's findStartOfNextVisualLineFromWrap.
			if (blockWrapState && blockWrapState.logicalPos === pos && blockWrapState.assoc === 1) {
				const target = findStartOfPreviousVisualLineFromWrap(view, pos);
				console.log('VISIBLE-CURSOR handleUp CASE1', {
					pos, target, blockWrapState
				});

				if (!target) {
					blockWrapState = null;
					return false; // top of document — let CM6 handle
				}

				if (target.isSoftWrap) {
					blockWrapState = { logicalPos: target.pos, showPos: target.pos, assoc: 1 };
					pendingDownFromWrapPos = target.pos;
				} else {
					blockWrapState = null;
					pendingDownFromWrapPos = null;
				}

				view.dispatch({
					selection: EditorSelection.cursor(target.pos, 1),
					scrollIntoView: true
				});
				return true;
			}

			// CASE 2: Cursor NOT at a known wrap boundary.
			// Let CM6 handle the movement; navCorrection fixes assoc if needed.
			console.log('VISIBLE-CURSOR handleUp CASE2', {
				pos, selAssoc: sel.assoc, blockWrapState
			});
			return false;
		};

		const navCorrection = EditorView.updateListener.of((update: ViewUpdate) => {
			if (!update.selectionSet && !update.docChanged) return;

			const sel = update.state.selection.main;
			const oldSel = update.startState.selection.main;
			const pos = sel.head;

			const oldWrapState = blockWrapState;

			if (blockWrapState !== null) {
				if (update.docChanged || !sel.empty || sel.head !== blockWrapState.logicalPos) {
					blockWrapState = null;
				}
			}

			if (pendingDownFromWrapPos !== null) {
				if (update.docChanged || !sel.empty) {
					pendingDownFromWrapPos = null;
				}
			}

			if (!update.selectionSet || update.docChanged) return;
			if (plugin.settings.customCursorStyle !== 'block') return;
			if (!sel.empty) return;

			if (update.transactions.some(t => t.isUserEvent('select.pointer'))) return;
			if (update.transactions.some(t => t.isUserEvent('emacs.moveToEnd'))) return;

			// 1. Handle moving FORWARD by 1 char from a wrap boundary (e.g. Emacs forward char after End key)
			if (pos - oldSel.head === 1) {
				if (isSoftWrap(update.view, pos)) {
					blockWrapState = { logicalPos: pos, showPos: pos, assoc: 1 };
					pendingDownFromWrapPos = pos;
					update.view.dispatch({
						selection: EditorSelection.cursor(pos, 1)
					});
					return;
				}
				if (isSoftWrap(update.view, oldSel.head) && oldSel.assoc === -1) {
					blockWrapState = { logicalPos: oldSel.head, showPos: oldSel.head, assoc: 1 };
					pendingDownFromWrapPos = oldSel.head;
					update.view.dispatch({
						selection: EditorSelection.cursor(oldSel.head, 1)
					});
					return;
				}
			}

			// 1b. Handle moving BACKWARD by 1 char onto a wrap boundary
			if (pos - oldSel.head === -1 && isSoftWrap(update.view, pos) && sel.assoc !== 1) {
				blockWrapState = { logicalPos: pos, showPos: pos, assoc: 1 };
				pendingDownFromWrapPos = pos;
				update.view.dispatch({
					selection: EditorSelection.cursor(pos, 1)
				});
				return;
			}

			// 2. Generalized vertical movement correction
			if (pos !== oldSel.head && Math.abs(pos - oldSel.head) > 1) {
				// If the user pressed End or Home, do NOT apply vertical corrections
				// because they are horizontal movements that can look like vertical ones
				if (plugin.lastKey === 'End' || plugin.lastKey === 'Home') {
					return;
				}

				const oldAssoc = (oldWrapState !== null && oldSel.head === oldWrapState.logicalPos) ? 1 : (oldSel.assoc || -1);
				const oldCoords = update.view.coordsAtPos(oldSel.head, oldAssoc);
				const newCoords = update.view.coordsAtPos(pos, sel.assoc || -1);
				
				if (oldCoords && newCoords) {
					const dy = newCoords.top - oldCoords.top;
					const lineHeight = update.view.defaultLineHeight;
					
					// 2a. If moved UP from >1 line below and landed on a wrap boundary, force assoc: 1
					// This replaces the old pendingUpFromPos logic.
					// We check dy < -lineHeight * 1.5 because if we moved UP from the end of the SAME visual line (line b)
					// to the end of the previous visual line (line a), dy would be -1 * lineHeight.
					// In that case, we WANT to stay on line a (assoc: -1).
					// But if we moved UP from line c to the start of line b, newCoords (with assoc: -1) is on line a,
					// so dy is -2 * lineHeight. In that case, we WANT to force assoc: 1 to be on line b.
					if (dy < -lineHeight * 1.5 && isSoftWrap(update.view, pos) && sel.assoc !== 1) {
						blockWrapState = { logicalPos: pos, showPos: pos, assoc: 1 };
						pendingDownFromWrapPos = pos;
						update.view.dispatch({
							selection: EditorSelection.cursor(pos, 1)
						});
						return;
					}
					
					// 2b. If moved exactly 1 line DOWN from a wrap boundary (e.g. Emacs next line)
					if (oldWrapState !== null && oldSel.head === oldWrapState.logicalPos) {
						if (dy > lineHeight * 0.5 && dy < lineHeight * 1.5) {
							const target = findStartOfNextVisualLineFromWrap(update.view, oldSel.head);
							if (target) {
								blockWrapState = { logicalPos: target.pos, showPos: target.pos, assoc: 1 };
								pendingDownFromWrapPos = target.pos;
								update.view.dispatch({
									selection: EditorSelection.cursor(target.pos, 1),
									scrollIntoView: true
								});
								return;
							}
						}
						
						// 2c. If moved exactly 1 line UP from a wrap boundary (e.g. Emacs previous line)
						if (dy < -lineHeight * 0.5 && dy > -lineHeight * 1.5) {
							const target = findStartOfPreviousVisualLineFromWrap(update.view, oldSel.head);
							if (target) {
								if (target.isSoftWrap) {
									blockWrapState = { logicalPos: target.pos, showPos: target.pos, assoc: 1 };
									pendingDownFromWrapPos = target.pos;
								}
								update.view.dispatch({
									selection: EditorSelection.cursor(target.pos, 1),
									scrollIntoView: true
								});
								return;
							}
						}

						// 2d. If moved to the end of the SAME visual line (dy === 0), but it wasn't the End key
						// This happens with Obsidian's goDown command (Emacs next line) because it uses logical columns
						if (Math.abs(dy) < 1) {
							const target = findStartOfNextVisualLineFromWrap(update.view, oldSel.head);
							if (target) {
								blockWrapState = { logicalPos: target.pos, showPos: target.pos, assoc: 1 };
								pendingDownFromWrapPos = target.pos;
								update.view.dispatch({
									selection: EditorSelection.cursor(target.pos, 1),
									scrollIntoView: true
								});
								return;
							}
						}
					}
				}
			}
		});

		return [
			Prec.highest(keymap.of([
				{ key: 'ArrowRight', run: handleRight },
				{ key: 'ArrowLeft', run: handleLeft },
				{ key: 'ArrowDown', run: handleDown },
				{ key: 'ArrowUp', run: handleUp },
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
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				const editorView = (leaf.view.editor as any).cm as EditorView;
				if (editorView) {
					editorView.dispatch({ selection: editorView.state.selection });
				}
			}
		});
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
		window.removeEventListener('keydown', this.boundKeydown, { capture: true });
		delete (window as any)._visibleCursorForwardChar;
	}
}
