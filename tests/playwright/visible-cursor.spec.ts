import { expect, test } from '@playwright/test';
import type { HarnessRect } from './harnessTypes';

const DOC = 'Before\n[[test-notes/Note-09.md#Note Nine |Note Nine]]\nAfter';

test.beforeEach(async ({ page }) => {
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
