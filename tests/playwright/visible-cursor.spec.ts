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

test('expanding selection preserves the character text at selection start', async ({ page }) => {
	await page.evaluate(() => {
		const harness = window.__visibleCursorHarness;
		if (!harness) throw new Error('Harness unavailable');
		harness.setDoc('123456789', 0);
		// Expand selection from position 0 ('1') to position 4 ('5')
		harness.setSelection(0, 4);
	});
	await page.waitForTimeout(100);

	const charText = await page.evaluate(() => {
		return window.__visibleCursorHarness?.getCustomCursorText() ?? null;
	});

	// The block cursor positioned at selection start (pos 0) must display character '1', not '5'
	expect(charText).toBe('1');
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

