import { Plugin, MarkdownView } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { VisibleCursorPluginSettings, DEFAULT_SETTINGS, VisibleCursorSettingTab } from './settings';
import { ColorProvider } from './src/services/colorProvider';
import { FlashScheduler, type FlashState } from './src/services/flashScheduler';
import { FlashRenderer } from './src/services/flashRenderer';
import { hexToRgb, adjustColorForThinBar } from './src/utils';

class EndOfLineWidget extends WidgetType {
	constructor(private markerColor: string, private contrastColor: string, private style: 'block' | 'bar' = 'block', private lineHeight?: number) {
		super();
	}
	toDOM() {
		const span = document.createElement('span');
		span.textContent = ' ';
		
		if (this.style === 'bar') {
			span.className = 'cursor-flash-bar';
			const heightStyle = this.lineHeight ? `height: ${this.lineHeight}px;` : 'height: 1em;';
			span.style.cssText = `
				display: inline-block;
				width: 4px;
				${heightStyle}
				background-color: ${this.markerColor};
				pointer-events: none;
				vertical-align: text-bottom;
				margin-left: -1px;
			`;
		} else {
			span.className = 'cursor-flash-block-mark';
			span.style.cssText = `
				background-color: ${this.markerColor};
				color: ${this.contrastColor};
				display: inline-block;
				width: 0.5em;
				pointer-events: none;
			`;
		}
		span.setAttribute('aria-hidden', 'true');
		return span;
	}
}

class BarCursorWidget extends WidgetType {
	constructor(private markerColor: string, private lineHeight: number) {
		super();
	}
	toDOM() {
		// width:0 + overflow:visible ensures the widget takes no space in the text flow,
		// which prevents it from displacing characters across soft-wrap boundaries.
		const span = document.createElement('span');
		span.className = 'cursor-flash-bar';
		span.style.cssText = `
			display: inline-block;
			width: 0;
			height: ${this.lineHeight}px;
			overflow: visible;
			pointer-events: none;
			vertical-align: text-bottom;
			position: relative;
			z-index: 1;
		`;
		// The visible cursor is a separate absolutely positioned element
		const bar = document.createElement('span');
		bar.style.cssText = `
			position: absolute;
			left: 0;
			top: 0;
			width: 3px;
			height: ${this.lineHeight}px;
			background-color: ${this.markerColor};
			pointer-events: none;
		`;
		span.appendChild(bar);
		span.setAttribute('aria-hidden', 'true');
		return span;
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
	private flashActive: boolean = false;
	private decorationView: EditorView | null = null;
	private clickFenceActive: boolean = false;
	private pendingFlashTrigger: string | null = null;
	private scrollFlashSuppressedUntil: number = 0;
	private boundStartFence: () => void;
	private boundEndFenceSoon: () => void;
	private boundClickEndFence: () => void;

	// Services
	private colorProvider: ColorProvider;
	private flashScheduler: FlashScheduler;
	private flashRenderer: FlashRenderer;

	async onload() {
		await this.loadSettings();

		// Initialize services
		this.colorProvider = new ColorProvider();
		this.flashScheduler = new FlashScheduler();
		this.flashRenderer = new FlashRenderer();

		this.addSettingTab(new VisibleCursorSettingTab(this.app, this));

		const decorationPlugin = this.createDecorationPlugin();
		this.registerEditorExtension([
			decorationPlugin,
			this.createDOMEventHandlers()
		]);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
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
			})
		);

		// Global click fence: block flash work during pointer->click and a short tail
		this.boundStartFence = () => { this.clickFenceActive = true; };
		this.boundEndFenceSoon = () => { setTimeout(() => { this.clickFenceActive = false; }, 400); };
		this.boundClickEndFence = () => { this.boundEndFenceSoon(); };
		window.addEventListener('pointerdown', this.boundStartFence, { capture: true });
		window.addEventListener('pointerup', this.boundEndFenceSoon, { capture: true });
		window.addEventListener('pointercancel', this.boundEndFenceSoon, { capture: true });
		window.addEventListener('click', this.boundClickEndFence, { capture: true });
	}

	createDecorationPlugin() {
		const plugin = this;
		return ViewPlugin.fromClass(class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = Decoration.none;
				plugin.decorationView = view;
			}

			update(update: ViewUpdate) {
				this.decorations = this.buildDecorations(update.view);
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder();
				if (!view.hasFocus) {
					return builder.finish() as DecorationSet;
				}

				const showAlwaysOn = plugin.settings.customCursorMode === 'always';
				const showFlash = plugin.settings.customCursorMode === 'flash' && plugin.flashActive;
				const shouldShowCursor = showAlwaysOn || showFlash;

				if (!shouldShowCursor) {
					return builder.finish() as DecorationSet;
				}

				const pos = view.state.selection.main.head;
				const markerColor = plugin.colorProvider.getColor(plugin.settings).color;
				const contrastColor = plugin.colorProvider.getContrastColor(markerColor);
				// Thinbar uses a slightly darkened color to maintain visual weight at 2px width
				const thinBarColor = adjustColorForThinBar(markerColor);
				plugin.updateCursorStyles(markerColor, contrastColor, thinBarColor);

				// Get the actual line height from font-size which is more reliable
				let actualLineHeight = view.defaultLineHeight;
				try {
					const domAtPos = view.domAtPos(pos);
					if (domAtPos && domAtPos.node) {
						const element = domAtPos.node.nodeType === 1
							? domAtPos.node as HTMLElement
							: domAtPos.node.parentElement;
						if (element) {
							const lineElement = element.closest('.cm-line');
							if (lineElement) {
								const computedStyle = getComputedStyle(lineElement);
								// Use font-size which matches cursor height better
								const fontSize = computedStyle.fontSize;
								const parsed = parseFloat(fontSize);
								if (!isNaN(parsed)) {
									actualLineHeight = parsed * 1.5; // Approximate line height as 1.5x font size
								}
							}
						}
					}
				} catch (e) {
					// Fallback to default if there's any error
					actualLineHeight = view.defaultLineHeight;
				}

				if (pos >= view.state.doc.length) {
					if (view.state.doc.length > 0) {
						const isThinBar = plugin.settings.customCursorStyle === 'thinbar';
						const widgetStyle = (plugin.settings.customCursorStyle === 'bar' || isThinBar) ? 'bar' : 'block';
						const eolColor = isThinBar ? thinBarColor : markerColor;
						const widget = Decoration.widget({
							widget: new EndOfLineWidget(eolColor, contrastColor, widgetStyle, actualLineHeight),
							side: 1
						});
						builder.add(view.state.doc.length, view.state.doc.length, widget);
					}
				} else {
					const char = view.state.doc.sliceString(pos, pos + 1);
					let isEOL = char === '\n' || char === '';

					// Detect soft-wrap: if selection arrived from the right (assoc < 0),
					// check if position pos is visually at the end of a wrapped line.
					// coordsAtPos(pos, -1) gives coords approaching from the left (end of prev visual line),
					// coordsAtPos(pos, 1) gives coords approaching from the right (start of next visual line).
					// If they differ in vertical position, pos is a soft-wrap boundary.
					let isSoftWrapEnd = false;
					if (!isEOL && view.state.selection.main.assoc < 0) {
						try {
							const coordsLeft = view.coordsAtPos(pos, -1);
							const coordsRight = view.coordsAtPos(pos, 1);
							if (coordsLeft && coordsRight && Math.abs(coordsLeft.top - coordsRight.top) > (actualLineHeight * 0.5)) {
								isSoftWrapEnd = true;
							}
						} catch (e) {
							// coordsAtPos can throw; ignore and treat as non-soft-wrap
						}
					}

					if (isEOL || isSoftWrapEnd) {
						// For soft-wrap ends use side:-1 so the widget appears at the end of the current
						// visual line rather than at the start of the next one.
						const widgetSide = isSoftWrapEnd ? -1 : 1;
						// thinbar uses the same EOL widget style as bar (a thin vertical line)
						// but with an adjusted color for visual weight compensation
						const isThinBar = plugin.settings.customCursorStyle === 'thinbar';
						const widgetStyle = (plugin.settings.customCursorStyle === 'bar' || isThinBar) ? 'bar' : 'block';
						const eolColor = isThinBar ? thinBarColor : markerColor;
						const widget = Decoration.widget({
							widget: new EndOfLineWidget(eolColor, contrastColor, widgetStyle, actualLineHeight),
							side: widgetSide
						});
						builder.add(pos, pos, widget);
					} else {
						// Use mark decoration for all cursor styles.
						// Decoration.mark wraps an existing character in a span without inserting
						// new DOM nodes, so it cannot affect word-breaking or text reflow.
						// The bar/thinbar cursor appearance is achieved via CSS ::before pseudo-element.
						let markClass: string;
						if (plugin.settings.customCursorStyle === 'bar') {
							markClass = 'cursor-flash-bar-mark';
						} else if (plugin.settings.customCursorStyle === 'thinbar') {
							markClass = 'cursor-flash-thinbar-mark';
						} else {
							markClass = 'cursor-flash-block-mark';
						}
						const decoration = Decoration.mark({
							attributes: { class: markClass }
						});
						builder.add(pos, pos + 1, decoration);
					}
				}

				return builder.finish() as DecorationSet;
			}
		}, {
			decorations: (v: any) => v.decorations
		});
	}

	createDOMEventHandlers() {
		const plugin = this;

		return EditorView.domEventHandlers({
			scroll: (event: Event, view: EditorView) => {
				if (!plugin.settings.flashOnWindowScrolls) return false;

				const currentScrollPos = view.scrollDOM.scrollTop;
				const scrollDelta = Math.abs(currentScrollPos - plugin.lastScrollPosition);
				plugin.lastScrollPosition = currentScrollPos;

				// While a flash is active (or was recently shown), keep extending the
				// suppression window and cancel any pending debounce.  This prevents
				// momentum / inertial scrolling from triggering a second flash.
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

		// Cancel any pending scroll debounce so it can't fire after this flash
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

		// Always set flashActive as a cooldown guard to prevent
		// double-triggering (e.g. scroll → showFlash → layout shift → scroll)
		this.flashActive = true;
		if (this.resetFlashTimeout) {
			clearTimeout(this.resetFlashTimeout);
		}

		// Only dispatch when customCursorMode is 'flash' (to toggle the decoration).
		// Allow dispatch during click fence for view-change/layout-change triggers.
		const isViewFlashTrigger = this.pendingFlashTrigger === 'view-change' || this.pendingFlashTrigger === 'layout-change';
		if (this.settings.customCursorMode === 'flash') {
			if (isViewFlashTrigger || !this.clickFenceActive) { editorView.dispatch({}); }
		}

		this.resetFlashTimeout = this.flashScheduler.scheduleReset(() => {
			this.flashActive = false;
			if (this.settings.customCursorMode === 'flash') {
				editorView.dispatch({});
			}
		}, this.settings.lineDuration);
	}

	showLineFlash(editorView: EditorView) {
		const cursor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!cursor) return;

		const pos = (cursor as any).posToOffset(cursor.getCursor());
		const coords = editorView.coordsAtPos(pos);
		if (!coords) return;

		const editorElement = editorView.contentDOM;
		const editorRect = editorElement.getBoundingClientRect();
		const lineHeight = editorView.defaultLineHeight;
		const { color, opacity } = this.colorProvider.getColor(this.settings);
		const rgb = hexToRgb(color);
		// Calculate highlight distance based on flashSize setting (in character widths)
		const fontSize = parseFloat(getComputedStyle(editorElement).fontSize) || 16;
		const charWidth = fontSize * 0.6; // Approximate character width
		const highlightDistance = this.settings.flashSize * charWidth; // Direct width in pixels
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
		const cursor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!cursor) return;

		const pos = (cursor as any).posToOffset(cursor.getCursor());
		const coords = editorView.coordsAtPos(pos);
		if (!coords) return;

		const editorElement = editorView.contentDOM;
		const editorRect = editorElement.getBoundingClientRect();
		const lineHeight = editorView.defaultLineHeight;
		const { color, opacity } = this.colorProvider.getColor(this.settings);
		const rgb = hexToRgb(color);
		// Calculate highlight distance based on flashSize setting (in character widths)
		const fontSize = parseFloat(getComputedStyle(editorElement).fontSize) || 16;
		const charWidth = fontSize * 0.6; // Approximate character width
		const highlightDistance = this.settings.flashSize * charWidth; // Direct width in pixels
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
		const cursor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!cursor) return;

		const pos = (cursor as any).posToOffset(cursor.getCursor());
		const coords = editorView.coordsAtPos(pos);
		if (!coords) return;

		const editorElement = editorView.contentDOM;
		const editorRect = editorElement.getBoundingClientRect();
		const lineHeight = editorView.defaultLineHeight;
		const cursorX = coords.left - editorRect.left;
		const editorWidth = editorRect.width;
		const cursorPercent = (cursorX / editorWidth) * 100;
		const { color, opacity } = this.colorProvider.getColor(this.settings);
		const rgb = hexToRgb(color);

		const peakOpacity = opacity;
		const fadeOpacity = opacity * 0.75;
		// Calculate spread distance based on flashSize setting (in character widths)
		const fontSize = parseFloat(getComputedStyle(editorElement).fontSize) || 16;
		const charWidth = fontSize * 0.6; // Approximate character width
		const spreadDistance = (this.settings.flashSize / 2) * charWidth; // flashSize/2 on each side
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



	private updateCursorStyles(markerColor: string, contrastColor: string, thinBarColor?: string): void {
		if (this.styleElement) {
			this.styleElement.remove();
		}
		
		this.styleElement = document.createElement('style');
		this.styleElement.id = 'cursor-flash-dynamic-styles';
		
		const tbColor = thinBarColor ?? markerColor;
		
		// Block cursor: highlight the character with a background color.
		// Bar/thinbar cursor: draw a thin vertical bar before the character using ::before pseudo-element.
		// Using Decoration.mark (not widget) for all, so no DOM nodes are inserted between
		// text characters — this prevents the cursor decoration from affecting word-wrap.
		const styleContent = `
			.cursor-flash-block-mark {
				background-color: ${markerColor} !important;
				color: ${contrastColor} !important;
				position: relative;
			}
			.cursor-flash-bar-mark {
				position: relative;
			}
			.cursor-flash-bar-mark::before {
				content: '';
				position: absolute;
				left: 0;
				top: 0;
				bottom: 0;
				width: 3px;
				background-color: ${markerColor};
				pointer-events: none;
				z-index: 2;
			}
			.cursor-flash-thinbar-mark {
				position: relative;
			}
			.cursor-flash-thinbar-mark::before {
				content: '';
				position: absolute;
				left: 0;
				top: 0;
				bottom: 0;
				width: 2px;
				background-color: ${tbColor};
				pointer-events: none;
				z-index: 2;
			}
		`;
		
		this.styleElement.textContent = styleContent;
		document.head.appendChild(this.styleElement);
	}



	refreshDecorations() {
		if (this.decorationView && this.decorationView.hasFocus) {
			// Force a rebuild by dispatching with selection change to trigger update
			this.decorationView.dispatch({
				selection: this.decorationView.state.selection
			});
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Migrate old setting names and values
		const anySettings = this.settings as any;
		// Migrate 'blockCursorMode' to 'customCursorMode'
		if (anySettings.blockCursorMode !== undefined && anySettings.customCursorMode === undefined) {
			anySettings.customCursorMode = anySettings.blockCursorMode;
			delete anySettings.blockCursorMode;
		}
		// Migrate 'blockCursorStyle' to 'customCursorStyle'
		if (anySettings.blockCursorStyle !== undefined && anySettings.customCursorStyle === undefined) {
			anySettings.customCursorStyle = anySettings.blockCursorStyle;
			delete anySettings.blockCursorStyle;
		}
		// Migrate old 'thick-vertical' setting value to 'bar'
		if (anySettings.customCursorStyle === 'thick-vertical') {
			anySettings.customCursorStyle = 'bar';
		}
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		if (this.styleElement) {
			this.styleElement.remove();
		}
		if (this.flashTimeout) {
			clearTimeout(this.flashTimeout);
		}
		if (this.resetFlashTimeout) {
			clearTimeout(this.resetFlashTimeout);
		}
		if (this.scrollDebounceTimer) {
			clearTimeout(this.scrollDebounceTimer);
		}
		// Remove global event listeners added in onload
		window.removeEventListener('pointerdown', this.boundStartFence, { capture: true });
		window.removeEventListener('pointerup', this.boundEndFenceSoon, { capture: true });
		window.removeEventListener('pointercancel', this.boundEndFenceSoon, { capture: true });
		window.removeEventListener('click', this.boundClickEndFence, { capture: true });
	}
}
