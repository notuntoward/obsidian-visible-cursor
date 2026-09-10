import { expect, test } from '@playwright/test';
import type { HarnessRect } from './harnessTypes';

const DOC = 'Before\n[[test-notes/Note-09.md#Note Nine |Note Nine]]\nAfter';

test.beforeEach(async ({ page }) => {
	page.on('console', msg => {
		console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
	});
	page.on('pageerror', err => {
		console.log(`[Browser PageError] ${err.message}\n${err.stack}`);
	});
	await page.goto('/tests/playwright/index.html');
	await page.waitForFunction(() => Boolean(window.__visibleCursorHarness));
	await page.evaluate((doc) => {
		window.__visibleCursorHarness?.setDoc(doc, 0);
	}, DOC);
});

test('renders a visible custom cursor at position 0', async ({ page }) => {
	await page.evaluate(() => {
		window.__visibleCursorHarness?.setCursor(0);
	});
	// Give CM6 a frame to run requestMeasure
	await page.waitForTimeout(100);

	const rect = await page.evaluate(() => window.__visibleCursorHarness?.getCustomCursorRect() ?? null);
	expect(rect).not.toBeNull();
	expect((rect as HarnessRect).height).toBeGreaterThan(0);
	expect((rect as HarnessRect).width).toBeGreaterThan(3);
});

test('block cursor has reasonable width on normal text', async ({ page }) => {
	await page.evaluate(() => {
		window.__visibleCursorHarness?.setCursor(0);
	});
	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const rect = harness.getCustomCursorRect();
		const defaultWidth = harness.getDefaultCharWidth();
		return { rect, defaultWidth };
	});

	expect(result.rect).not.toBeNull();
	// Block cursor width should be at least 50% of default character width
	expect((result.rect as HarnessRect).width).toBeGreaterThanOrEqual(result.defaultWidth * 0.5);
});

test('cursor can be placed inside wikilink alias text', async ({ page }) => {
	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const doc = harness.getDoc();
		const aliasStart = doc.indexOf('Note Nine');
		harness.setCursor(aliasStart);
		return { cursor: harness.getCursor(), aliasStart };
	});
	await page.waitForTimeout(100);

	expect(result.cursor.head).toBe(result.aliasStart);

	const rect = await page.evaluate(() => window.__visibleCursorHarness?.getCustomCursorRect() ?? null);
	expect(rect).not.toBeNull();
	expect((rect as HarnessRect).height).toBeGreaterThan(0);
	expect((rect as HarnessRect).width).toBeGreaterThan(3);
});

test('block cursor on indented bullet retains normal width', async ({ page }) => {
	await page.evaluate(() => {
		window.__visibleCursorHarness?.setDoc('  - indented bullet item', 0);
		window.__visibleCursorHarness?.setCursor(0);
	});
	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const rect = harness.getCustomCursorRect();
		const defaultWidth = harness.getDefaultCharWidth();
		return { rect, defaultWidth };
	});

	expect(result.rect).not.toBeNull();
	expect((result.rect as HarnessRect).width).toBeLessThan(result.defaultWidth * 2.0);
});

test('expanding selection follows the active head of the selection', async ({ page }) => {
	await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		harness.setDoc('123456789', 0);
	});

	const expectCursorAfterSelection = async (anchor: number, head: number, expectedChar: string) => {
		await page.evaluate(([a, h]) => {
			window.__visibleCursorHarness?.setSelection(a, h);
		}, [anchor, head]);
		await expect.poll(
			async () => page.evaluate(() => window.__visibleCursorHarness?.getCustomCursorText() ?? null),
			{ timeout: 2000 },
		).toBe(expectedChar);
	};

	// Left-to-right selection: anchor at 0, head at 4
	await expectCursorAfterSelection(0, 4, '5');

	// Right-to-left selection: anchor at 4, head at 0
	await expectCursorAfterSelection(4, 0, '1');
});

test('emacs.moveToBeginning on soft-wrapped line sets blockWrapState for visual line start', async ({ page }) => {
	const docText = 'From here, Garmin was the 2nd most accurate for bodyfat (0.5% from DEXA) but said to rely too much on non-bioelectric info like your age, etc….; Withings the most accurate (0.1% from DEXA)';

	const result = await page.evaluate((text) => {
		const host = document.querySelector('.cm-editor-host') as HTMLElement;
		if (host) host.style.width = '300px';

		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		harness.setDoc(text, text.length);

		const view = harness.getView() as import('@codemirror/view').EditorView;
		// Find a position that is actually a soft wrap boundary
		let softWrapPos = -1;
		for (let p = 1; p < text.length - 1; p++) {
			const c1 = view.coordsAtPos(p, -1);
			const c2 = view.coordsAtPos(p, 1);
			if (c1 && c2 && Math.abs(c1.top - c2.top) > 5) {
				softWrapPos = p;
				break;
			}
		}

		if (softWrapPos !== -1) {
			// Record the expected visual line start top coordinate
			const expectedTop = view.coordsAtPos(softWrapPos, 1)?.top ?? -1;
			harness.dispatchEmacsMoveToStart(softWrapPos);
			return { softWrapPos, expectedTop };
		}
		return { softWrapPos, expectedTop: -1 };
	}, docText);

	expect(result.softWrapPos).not.toBe(-1);

	await page.waitForTimeout(100);

	// The block cursor must render at the START of the visual line,
	// not at the end of the previous visual line.
	const cursorRect = await page.evaluate(() => {
		return window.__visibleCursorHarness?.getCustomCursorRect() ?? null;
	});

	expect(cursorRect).not.toBeNull();
	// cursor top should match the visual-line-start top (assoc=1 coords),
	// not be on the line above
	expect(cursorRect!.top).toBeCloseTo(result.expectedTop, 0);
});

test('block cursor on soft-wrap boundary with assoc=1 renders on the continuation line and displays the correct character', async ({ page }) => {
	const docText = 'Here is a long text that should definitely wrap across multiple lines of the editor to test the soft wrap boundary cursor alignment and character rendering';

	// Step 1: Set doc and resize host
	await page.evaluate((text) => {
		const host = document.querySelector('.cm-editor-host') as HTMLElement;
		if (host) host.style.width = '200px';

		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		harness.setDoc(text, 0);
	}, docText);

	// Step 2: Wait for layout reflow
	await page.waitForTimeout(100);

	// Step 3: Find soft-wrap boundary, set cursor with assoc=1, measure, and verify synchronously
	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;
		const text = harness.getDoc();

		let softWrapPos = -1;
		for (let p = 1; p < text.length - 1; p++) {
			const c1 = view.coordsAtPos(p, -1);
			const c2 = view.coordsAtPos(p, 1);
			if (c1 && c2 && Math.abs(c1.top - c2.top) > 5) {
				softWrapPos = p;
				break;
			}
		}

		if (softWrapPos !== -1) {
			const expectedTop = view.coordsAtPos(softWrapPos, 1)?.top ?? -1;
			const expectedChar = text.charAt(softWrapPos);

			// Move cursor with emacs.moveToBeginning userEvent to trigger the home-move logic
			harness.dispatchEmacsMoveToStart(softWrapPos);

			// Force synchronous measure and draw of custom cursor
			(view as any).measure();

			const rect = harness.getCustomCursorRect();
			const textContent = harness.getCustomCursorText();
			const cursor = harness.getCursor();

			return { softWrapPos, expectedTop, expectedChar, rect, textContent, cursor };
		}
		return { softWrapPos: -1, expectedTop: -1, expectedChar: '', rect: null, textContent: null, cursor: null };
	});

	expect(result.softWrapPos).not.toBe(-1);
	expect(result.rect).not.toBeNull();
	// The block cursor must be rendered on the continuation line (the top coordinates should match expectedTop)
	expect(result.rect!.top).toBeCloseTo(result.expectedTop, 0);
	// The block cursor must contain the correct character
	expect(result.textContent).toBe(result.expectedChar);
});

test('emacs.moveToEnd on soft-wrapped line renders cursor at visual line end with clean space', async ({ page }) => {
	const text = 'The quick brown fox jumps over the lazy dog and runs away into the deep dark forest on a sunny afternoon in spring.';
	await page.evaluate((doc) => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;
		view.dom.style.width = '200px';
		harness.setDoc(doc, 0);
	}, text);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;
		const docText = harness.getDoc();

		// Find soft wrap boundary
		let softWrapPos = -1;
		for (let p = 1; p < docText.length - 1; p++) {
			const c1 = view.coordsAtPos(p, -1);
			const c2 = view.coordsAtPos(p, 1);
			if (c1 && c2 && Math.abs(c1.top - c2.top) > 5) {
				softWrapPos = p;
				break;
			}
		}

		if (softWrapPos !== -1) {
			// Dispatch emacs.moveToEnd to the boundary position
			harness.dispatchEmacsMoveToEnd(softWrapPos);
			(view as any).measure();

			const rect = harness.getCustomCursorRect();
			const textContent = harness.getCustomCursorText();
			const defaultWidth = harness.getDefaultCharWidth();
			return { softWrapPos, rect, textContent, defaultWidth };
		}
		return { softWrapPos: -1, rect: null, textContent: null, defaultWidth: 10 };
	});

	expect(result.softWrapPos).not.toBe(-1);
	expect(result.rect).not.toBeNull();
	expect(result.rect!.width).toBeGreaterThanOrEqual(result.defaultWidth * 0.5);
	expect(result.textContent).toBe(' ');
});

test('block cursor on blank line renders standard character width without error', async ({ page }) => {
	const doc = 'Before\n\n[[test-notes/Note-09.md#Note Nine |Note Nine]]\n\nAfter';
	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 7); // position 7 is the first blank line
	}, doc);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const rect = harness.getCustomCursorRect();
		const defaultWidth = harness.getDefaultCharWidth();
		const textContent = harness.getCustomCursorText();
		return { rect, defaultWidth, textContent };
	});

	expect(result.rect).not.toBeNull();
	expect(result.rect!.width).toBeGreaterThanOrEqual(result.defaultWidth * 0.5);
	expect(result.rect!.width).toBeLessThanOrEqual(result.defaultWidth * 1.75);
	expect(result.textContent).toBe(' ');
});

test('navigating from blank line into wikilink alias renders full width character', async ({ page }) => {
	const doc = 'Before\n\n[[test-notes/Note-09.md#Note Nine |Note Nine]]\n\nAfter';
	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 7); // on blank line
	}, doc);

	await page.waitForTimeout(100);

	// Navigate to alias start
	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const aliasStart = harness.getDoc().indexOf('Note Nine');
		harness.setCursor(aliasStart);

		const rect = harness.getCustomCursorRect();
		const textContent = harness.getCustomCursorText();
		const defaultWidth = harness.getDefaultCharWidth();
		return { rect, textContent, defaultWidth };
	});

	expect(result.rect).not.toBeNull();
	expect(result.rect!.width).toBeGreaterThanOrEqual(result.defaultWidth * 0.5);
	expect(result.textContent).toBe('N');
});

test('block cursor on list item starting with wikilink retains normal width and does not stretch across bullet', async ({ page }) => {
	const doc = '- [[test-notes/Note-09.md#Note Nine |Note Nine]]';
	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 0);
	}, doc);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const aliasStart = harness.getDoc().indexOf('Note Nine');
		harness.setCursor(aliasStart);

		const rect = harness.getCustomCursorRect();
		const defaultWidth = harness.getDefaultCharWidth();
		const textContent = harness.getCustomCursorText();
		return { rect, defaultWidth, textContent };
	});

	expect(result.rect).not.toBeNull();
	expect(result.rect!.width).toBeGreaterThanOrEqual(result.defaultWidth * 0.5);
	expect(result.rect!.width).toBeLessThanOrEqual(result.defaultWidth * 1.75);
	expect(result.textContent).toBe('N');
});

test('emacs.moveToEnd on line ending with wikilink renders valid cursor at line end', async ({ page }) => {
	const doc = 'Leading text [[test-notes/Note-09.md#Note Nine |Note Nine]]';
	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 0);
	}, doc);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;
		harness.dispatchEmacsMoveToEnd(harness.getDoc().length);
		(view as any).measure();

		const rect = harness.getCustomCursorRect();
		const defaultWidth = harness.getDefaultCharWidth();
		const textContent = harness.getCustomCursorText();
		return { rect, defaultWidth, textContent };
	});

	expect(result.rect).not.toBeNull();
	expect(result.rect!.width).toBeGreaterThanOrEqual(result.defaultWidth * 0.5);
	expect(result.textContent).toBe(' ');
});

test('comprehensive multi-topology integration test across blank lines, lists, and start/end links', async ({ page }) => {
	const doc = [
		'',
		'[[test-notes/Note-01.md|First Link]] with some text',
		'',
		'Middle item [[test-notes/Note-02.md|Middle Link]] trailing',
		'',
		'- [[test-notes/Note-03.md|List Start Link]] followed by text',
		'  - Indented item ending with [[test-notes/Note-04.md|Last Link]]',
		'[[test-notes/Note-05.md|Standalone Link]]',
		''
	].join('\n');

	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 0);
	}, doc);

	await page.waitForTimeout(100);

	const verification = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;
		const docText = harness.getDoc();
		const lines = docText.split('\n');
		const defaultWidth = harness.getDefaultCharWidth();

		const stepResults: Array<{
			lineIndex: number;
			isClean: boolean;
			char: string | null;
			width: number;
		}> = [];

		let currentOffset = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.length === 0) {
				// Blank line: verify clean space
				harness.setCursor(currentOffset);
				(view as any).measure();
				const rect = harness.getCustomCursorRect();
				const text = harness.getCustomCursorText();
				stepResults.push({
					lineIndex: i,
					isClean: rect !== null && rect.width >= defaultWidth * 0.5 && rect.width <= defaultWidth * 1.75,
					char: text,
					width: rect?.width ?? 0
				});
			} else {
				// Line with content: test beginning of line / alias
				const aliasIdx = line.indexOf('|');
				const targetPos = aliasIdx !== -1 ? currentOffset + aliasIdx + 1 : currentOffset;
				harness.setCursor(targetPos);
				(view as any).measure();
				const rect = harness.getCustomCursorRect();
				const text = harness.getCustomCursorText();
				stepResults.push({
					lineIndex: i,
					isClean: rect !== null && rect.width >= defaultWidth * 0.5 && rect.width <= defaultWidth * 1.75,
					char: text,
					width: rect?.width ?? 0
				});
			}
			currentOffset += line.length + 1;
		}

		return { stepResults, defaultWidth };
	});

	for (const step of verification.stepResults) {
		expect(step.isClean).toBe(true);
		expect(step.char).not.toBe('[');
		expect(step.char).not.toBe(']');
	}
});

test('ArrowDown from blank line onto line start moves cursor down without wrap-correction interception', async ({ page }) => {
	const doc = 'First line\n\n[[test-notes/Note-05.md|Standalone Line Link]]\n';
	await page.evaluate((d) => {
		// Place cursor on blank line (offset 11: after "First line\n")
		window.__visibleCursorHarness?.setDoc(d, 11);
	}, doc);

	await page.waitForTimeout(100);

	// Press ArrowDown
	await page.keyboard.press('ArrowDown');
	await page.waitForTimeout(100);

	const afterDown = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const head = harness.getCursor().head;
		const rect = harness.getCustomCursorRect();
		return { head, rect };
	});

	// Cursor must have left the blank line (offset 11) and moved to line 3 (offset >= 12)
	expect(afterDown.head).toBeGreaterThan(11);
	expect(afterDown.rect).not.toBeNull();
});

test('block cursor at line-start collapsed link position renders the visible alias character instead of blotting out', async ({ page }) => {
	const doc = '[[test-notes/Note-01.md|First Link]] with some text';
	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 0);
	}, doc);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;

		// Simulate collapsed syntax at line start: positions 0..23 have collapsed width
		// while the visible alias starts at offset 24 ('First Link')
		const origCoords = view.coordsAtPos.bind(view);
		const aliasOffset = harness.getDoc().indexOf('First Link');
		const aliasCoords = origCoords(aliasOffset, -1);
		const aliasNextCoords = origCoords(aliasOffset + 1, -1);

		if (aliasCoords && aliasNextCoords) {
			view.coordsAtPos = ((pos: number, assoc?: 1 | -1) => {
				if (pos < aliasOffset) {
					return {
						top: aliasCoords.top,
						bottom: aliasCoords.bottom,
						left: aliasCoords.left,
						right: aliasCoords.left
					};
				}
				return origCoords(pos, assoc);
			}) as typeof view.coordsAtPos;
		}

		harness.setCursor(30);
		harness.dispatchEmacsMoveToStart(0);
		(view as any).measure();

		const rect = harness.getCustomCursorRect();
		const textContent = harness.getCustomCursorText();
		const defaultWidth = harness.getDefaultCharWidth();

		return { rect, textContent, defaultWidth };
	});

	expect(result.rect).not.toBeNull();
	expect(result.rect!.width).toBeGreaterThanOrEqual(result.defaultWidth * 0.5);
	expect(result.textContent).toBe('F');
});

test('suppresses default CodeMirror cursor layer and aligns coordinates at collapsed link position', async ({ page }) => {
	const doc = '[[test-notes/Note-01.md|First Link]] with some text';
	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 0);
	}, doc);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;

		const origCoords = view.coordsAtPos.bind(view);
		const aliasOffset = harness.getDoc().indexOf('First Link');
		const aliasCoords = origCoords(aliasOffset, -1);

		if (aliasCoords) {
			view.coordsAtPos = ((pos: number, assoc?: 1 | -1) => {
				if (pos < aliasOffset) {
					return {
						top: aliasCoords.top,
						bottom: aliasCoords.bottom,
						left: aliasCoords.left - 2,
						right: aliasCoords.left - 1
					};
				}
				return origCoords(pos, assoc);
			}) as typeof view.coordsAtPos;
		}

		harness.setCursor(30);
		harness.dispatchEmacsMoveToStart(0);
		(view as any).measure();

		const rect = harness.getCustomCursorRect();
		const editorDom = view.dom;
		const cursorLayer = editorDom.querySelector('.cm-cursorLayer') as HTMLElement | null;
		const defaultCursor = editorDom.querySelector('.cm-cursor') as HTMLElement | null;

		const layerDisplay = cursorLayer ? window.getComputedStyle(cursorLayer).display : null;
		const cursorDisplay = defaultCursor ? window.getComputedStyle(defaultCursor).display : null;
		const hasHideClass = editorDom.classList.contains('visible-cursor-hide-default');

		return {
			rect,
			aliasLeft: aliasCoords?.left,
			layerDisplay,
			cursorDisplay,
			hasHideClass
		};
	});

	expect(result.hasHideClass).toBe(true);
	expect(result.layerDisplay).toBe('none');
	expect(result.cursorDisplay).toBe('none');
	expect(result.rect).not.toBeNull();
	// Block cursor left must match visible character cell left, not the collapsed syntax left (-2px)
	expect(Math.abs(result.rect!.left - result.aliasLeft!)).toBeLessThan(1);
});

test('pressing End on soft-wrapped line places cursor on trailing character not in margin', async ({ page }) => {
	const doc = '• [[test-notes/Note-03.md|List Start Link]] followed by a long sentence that soft wraps across multiple lines to test soft wrapping and lists together.';
	await page.evaluate((d) => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;
		view.dom.style.width = '300px';
		harness.setDoc(d, 0);
	}, doc);

	await page.waitForTimeout(100);

	await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		const docText = harness!.getDoc();
		const idx = docText.indexOf('followed');
		harness!.setCursor(idx);
	});
	await page.waitForTimeout(100);

	await page.keyboard.press('End');
	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;
		const sel = view.state.selection.main;
		const rect = harness.getCustomCursorRect();
		const textContent = harness.getCustomCursorText();
		const defaultWidth = harness.getDefaultCharWidth();

		const cHeadBefore = view.coordsAtPos(sel.head, -1);
		const cHeadAfter = view.coordsAtPos(sel.head, 1);

		const c102 = view.coordsAtPos(102, 1);
		const c104 = view.coordsAtPos(104, 1);

		return {
			head: sel.head,
			assoc: sel.assoc,
			rect,
			textContent,
			defaultWidth,
			c102,
			cHeadBefore,
			cHeadAfter,
			c104
		};
	});

	expect(result.rect).not.toBeNull();
	expect(result.head).toBe(103);
	expect(result.textContent).toBe(' ');
	// Cursor left must match the trailing character position (cHeadBefore), not wrapped to next line
	expect(result.rect!.left).toBeCloseTo(result.cHeadBefore!.left, 0);
});

test('block cursor on the last character of a link does not misalign downwards', async ({ page }) => {
	const doc = '- Indented bullet with [[test-notes/Note-04.md|Indented Link]]';
	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 0);
	}, doc);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;

		const origCoords = view.coordsAtPos.bind(view);
		const linkText = 'Indented Link';
		const aliasOffset = harness.getDoc().indexOf(linkText);
		const lastCharOffset = aliasOffset + linkText.length - 1; // 'k'
		const trailingAnchorOffset = aliasOffset + linkText.length; // start of ']]'

		const normalCoords = origCoords(lastCharOffset, -1);
		const anchorCoords = origCoords(trailingAnchorOffset, -1);
		const prevCoords = origCoords(lastCharOffset - 1, -1);

		if (normalCoords && anchorCoords) {
			// Simulate Steady Links trailing anchor widget at ']]' with vertical-align: -0.2em (downshift)
			view.coordsAtPos = ((pos: number, assoc?: 1 | -1) => {
				if (pos >= trailingAnchorOffset) {
					return {
						top: normalCoords.top + 4, // shifted downwards by 4px
						bottom: normalCoords.bottom,
						left: anchorCoords.left,
						right: anchorCoords.left + 1
					};
				}
				return origCoords(pos, assoc);
			}) as typeof view.coordsAtPos;
		}

		harness.setCursor(lastCharOffset);
		(view as any).measure();

		const rect = harness.getCustomCursorRect();
		const textContent = harness.getCustomCursorText();

		return {
			rect,
			textContent,
			normalTop: normalCoords?.top,
			prevTop: prevCoords?.top,
			normalHeight: normalCoords ? normalCoords.bottom - normalCoords.top : null
		};
	});

	expect(result.rect).not.toBeNull();
	expect(result.textContent).toBe('k');
	// Block cursor top must match normal text top, not shifted down to anchor widget's top (+4px)
	expect(Math.abs(result.rect!.top - result.normalTop!)).toBeLessThan(1.5);
	expect(Math.abs(result.rect!.top - result.prevTop!)).toBeLessThan(1.5);
	expect(Math.abs(result.rect!.height - result.normalHeight!)).toBeLessThan(1.5);
});

test('block cursor on last character of link followed by trailing text does not misalign downwards', async ({ page }) => {
	const doc = 'Middle item [[test-notes/Note-02.md|Middle Link]] trailing text';
	await page.evaluate((d) => {
		window.__visibleCursorHarness?.setDoc(d, 0);
	}, doc);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;

		const origCoords = view.coordsAtPos.bind(view);
		const linkText = 'Middle Link';
		const aliasOffset = harness.getDoc().indexOf(linkText);
		const lastCharOffset = aliasOffset + linkText.length - 1; // 'k'
		const trailingAnchorOffset = aliasOffset + linkText.length; // start of ']]'
		const trailingTextOffset = harness.getDoc().indexOf('trailing');

		const normalCoords = origCoords(lastCharOffset, -1);
		const anchorCoords = origCoords(trailingAnchorOffset, -1);
		const prevCoords = origCoords(lastCharOffset - 1, -1);

		if (normalCoords && anchorCoords) {
			// Simulate Steady Links trailing anchor widget at ']]' with vertical-align: -0.2em (downshift)
			view.coordsAtPos = ((pos: number, assoc?: 1 | -1) => {
				if (pos >= trailingAnchorOffset && pos < trailingTextOffset) {
					return {
						top: normalCoords.top + 4,
						bottom: normalCoords.bottom,
						left: anchorCoords.left,
						right: anchorCoords.left + 1
					};
				}
				return origCoords(pos, assoc);
			}) as typeof view.coordsAtPos;
		}

		harness.setCursor(lastCharOffset);
		(view as any).measure();

		const rect = harness.getCustomCursorRect();
		const textContent = harness.getCustomCursorText();

		return {
			rect,
			textContent,
			normalTop: normalCoords?.top,
			prevTop: prevCoords?.top,
			normalHeight: normalCoords ? normalCoords.bottom - normalCoords.top : null
		};
	});

	expect(result.rect).not.toBeNull();
	expect(result.textContent).toBe('k');
	expect(Math.abs(result.rect!.top - result.normalTop!)).toBeLessThan(1.5);
	expect(Math.abs(result.rect!.top - result.prevTop!)).toBeLessThan(1.5);
	expect(Math.abs(result.rect!.height - result.normalHeight!)).toBeLessThan(1.5);
});





