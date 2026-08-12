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

test('emacs.moveToEnd / End on a soft-wrapped line lands on the wrap-boundary space (assoc=-1) on the upper visual line', async ({ page }) => {
	const docText = 'Here is a long text that should definitely wrap across multiple lines of the editor to test the soft wrap boundary cursor alignment and character rendering';

<<<<<<< ours
	// Step 1: load the document, then derive a narrow editor width from the
	// actual character metrics so the text is guaranteed to soft-wrap
	// regardless of the font or environment (no hard-coded pixel width).
	await page.evaluate((text) => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		harness.setDoc(text, 0);
		const charWidth = harness.getDefaultCharWidth() || 8;
		const host = document.querySelector('.cm-editor-host') as HTMLElement;
		if (host) host.style.width = `${Math.ceil(charWidth * 24)}px`;
	}, docText);

	// Step 2: wait until the layout has settled and a soft-wrap boundary is
	// detectable. Using expect.poll (instead of a fixed timeout) makes the
	// test robust to environment-dependent reflow timing.
	await expect.poll(
		async () => page.evaluate(() => window.__visibleCursorHarness?.findFirstSoftWrap() ?? null),
		{ timeout: 2000 },
	).not.toBeNull();

	// Step 3: find the boundary, dispatch the move-to-end, force a
	// synchronous measure, read the rendered cursor rect, then delete forward
	// — all in one evaluate so the cursor position and measurement stay in
	// sync.
	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');

		const boundary = harness.findFirstSoftWrap();
		if (!boundary) {
			return {
				softWrapPos: -1,
				upperTop: -1,
				lowerTop: -1,
				rect: null,
				expectedChar: '',
				moveResult: { head: -1, assoc: 0 },
				deleteResult: { deletedChar: '', headBefore: -1 },
			};
		}

		const expectedChar = harness.getDoc().charAt(boundary.pos);
		// Start a few characters before the wrap point, like a user pressing
		// End from the middle of the upper visual line.
		const fromPos = Math.max(0, boundary.pos - 3);
		const moveResult = harness.dispatchEmacsMoveToEndFrom(fromPos);

		harness.measure();

		const rect = harness.getCustomCursorRect();
		const deleteResult = harness.deleteForwardAtCursor();

		return {
			softWrapPos: boundary.pos,
			upperTop: boundary.upperTop,
			lowerTop: boundary.lowerTop,
			rect,
			expectedChar,
			moveResult,
			deleteResult,
		};
=======
	await page.evaluate((text) => {
		const host = document.querySelector('.cm-editor-host') as HTMLElement;
		if (host) host.style.width = '200px';

		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		harness.setDoc(text, 0);
	}, docText);

	await page.waitForTimeout(100);

	const result = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		const view = harness.getView() as import('@codemirror/view').EditorView;
		const text = harness.getDoc();

		// Find the first soft-wrap boundary and a position a few chars before it
		// (so the cursor starts in the middle of the upper visual line, like a
		// user pressing End from somewhere before the wrap point).
		let softWrapPos = -1;
		for (let p = 1; p < text.length - 1; p++) {
			const c1 = view.coordsAtPos(p, -1);
			const c2 = view.coordsAtPos(p, 1);
			if (c1 && c2 && Math.abs(c1.top - c2.top) > 5) {
				softWrapPos = p;
				break;
			}
		}

		if (softWrapPos === -1) {
			return { softWrapPos, upperTop: -1, lowerTop: -1, rect: null, cursor: null, expectedChar: '', moveResult: { head: -1, assoc: 0 }, deleteResult: { deletedChar: '', headBefore: -1 } };
		}

		const upperTop = view.coordsAtPos(softWrapPos, -1)?.top ?? -1;
		const lowerTop = view.coordsAtPos(softWrapPos, 1)?.top ?? -1;
		const expectedChar = text.charAt(softWrapPos);

		const fromPos = Math.max(0, softWrapPos - 3);
		const moveResult = harness.dispatchEmacsMoveToEndFrom(fromPos);

		(view as any).measure();

		const rect = harness.getCustomCursorRect();
		const cursor = harness.getCursor();
		const deleteResult = harness.deleteForwardAtCursor();

		return { softWrapPos, upperTop, lowerTop, rect, cursor, expectedChar, moveResult, deleteResult };
>>>>>>> theirs
	});

	expect(result.softWrapPos).not.toBe(-1);
	// CM6's moveToLineBoundary(forward) returns assoc=-1 at the wrap boundary
	expect(result.moveResult.assoc).toBe(-1);
	expect(result.rect).not.toBeNull();
	// The block cursor must render on the UPPER visual line (its top matches the
	// assoc=-1 coordinates), NOT on the continuation line. Rendering on the lower
	// line would mean DELETE removes the first char of the next visual line instead
	// of the wrap-boundary space.
	expect(result.rect!.top).toBeCloseTo(result.upperTop, 0);
	expect(result.rect!.top).not.toBeCloseTo(result.lowerTop, 0);
	// Pressing Delete after End must remove the wrap-boundary space (the char at
	// softWrapPos), NOT the first character of the next visual line. This is the
	// emacs visual-line-mode behaviour the user expects.
	expect(result.deleteResult.headBefore).toBe(result.softWrapPos);
	expect(result.deleteResult.deletedChar).toBe(result.expectedChar);
});
<<<<<<< ours

test('block cursor on narrow characters (i, ., ,, ;, :) renders the character instead of blotting it out', async ({ page }) => {
	const docText = 'inside, ideas; last: period.';

	await page.evaluate((text) => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		harness.setDoc(text, 0);
		// Use a proportional font so narrow characters (i, ., ,, ;, :) actually
		// measure narrower than defaultCharacterWidth, reproducing the bug
		// where the min-width fallback blots them out.
		const content = document.querySelector('.cm-content') as HTMLElement;
		if (content) content.style.fontFamily = 'sans-serif';
	}, docText);

	// Find positions of each narrow character in the document
	const positions = await page.evaluate((text) => {
		const targets = ['i', '.', ',', ';', ':'];
		const found: Array<{ char: string; pos: number }> = [];
		for (let p = 0; p < text.length; p++) {
			if (targets.includes(text[p])) {
				found.push({ char: text[p], pos: p });
			}
		}
		return found;
	}, docText);

	expect(positions.length).toBeGreaterThan(0);

	for (const { char, pos } of positions) {
		await page.evaluate(([p]) => {
			window.__visibleCursorHarness?.setCursor(p);
		}, [pos]);

		await expect.poll(
			async () => page.evaluate(() => window.__visibleCursorHarness?.getCustomCursorText() ?? null),
			{ timeout: 2000 },
		).toBe(char);
	}
});

test('native cursor stays hidden even when custom cursor cannot measure coordinates', async ({ page }) => {
	await page.evaluate(() => {
		window.__visibleCursorHarness?.setDoc('hello world', 0);
		window.__visibleCursorHarness?.setCursor(5);
	});
	await page.waitForTimeout(100);

	// When the editor has focus and the custom cursor mode is active, the
	// native caret must stay hidden even if the custom cursor layer can't
	// render (e.g. cursor at a collapsed link-syntax boundary where
	// coordsAtPos returns null).  This prevents the native blinking caret
	// from leaking through at link edges.
	const isHidden = await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		return harness.hasNativeCursorHidden();
	});
	expect(isHidden).toBe(true);
});

test('block cursor renders a space for characters hidden via opacity:0 (markdown link brackets)', async ({ page }) => {
	await page.evaluate(() => {
		window.__visibleCursorHarness?.setDoc('[link text](url)', 0);
		window.__visibleCursorHarness?.setCursor(0);
	});

	// Wait for the cursor to render normally first
	await expect.poll(
		async () => page.evaluate(() => window.__visibleCursorHarness?.getCustomCursorText() ?? null),
		{ timeout: 2000 },
	).toBe('[');

	// Simulate Obsidian Live Preview hiding the bracket by applying an
	// opacity:0 decoration via CM6's Decoration API (the same mechanism
	// Obsidian uses internally).
	await page.evaluate(() => {
		window.__visibleCursorHarness?.hideCharAtPos(0);
	});

	// The block cursor should now render a space, not the bracket character '['
	await expect.poll(
		async () => page.evaluate(() => window.__visibleCursorHarness?.getCustomCursorText() ?? null),
		{ timeout: 2000 },
	).toBe(' ');
});
=======
>>>>>>> theirs
