import { expect, test } from '@playwright/test';

test('settings dropdowns stay compact across Obsidian responsive widths', async ({ page }) => {
	await page.goto('/tests/playwright/index.html');
	await page.waitForFunction(() => Boolean(window.__visibleCursorHarness));
	await page.evaluate(() => {
		const classes = window.__visibleCursorHarness!.getSettingsGroupClasses();
		const native = document.createElement('style');
		native.textContent = `
			.setting-item-control { display: flex; }
			@container (max-width: 400px) {
				.setting-item:not(:is(.mod-toggle,.mod-navigable,.mod-action,.setting-item-heading,.mod-list *)) .setting-item-control select {
					width: 100%; max-width: 100%;
				}
			}
		`;
		document.head.appendChild(native);
		const host = document.createElement('div');
		host.id = 'settings-test';
		document.body.appendChild(host);
		for (const [index, cls] of [classes[0], classes[0], classes[1], ''].entries()) {
			const group = document.createElement('div');
			group.className = cls;
			group.style.containerType = 'inline-size';
			group.innerHTML = '<div class="setting-item"><div class="setting-item-control"><select><option>Centered around cursor</option></select></div></div>';
			group.dataset.testid = `group-${index}`;
			host.appendChild(group);
		}
	});

	const groups = page.locator('#settings-test > div');
	const widths = async (containerWidth: number) => {
		await groups.evaluateAll((elements, width) => {
			for (const element of elements) (element as HTMLElement).style.width = `${width}px`;
		}, containerWidth);
		return groups.locator('select').evaluateAll((elements) =>
			elements.map((element) => element.getBoundingClientRect().width));
	};
	const wide = await widths(600);
	const narrow = await widths(350);
	for (let i = 0; i < 3; i++) {
		expect(narrow[i]).toBeLessThan(300);
		expect(narrow[i]).toBeCloseTo(wide[i], 0);
	}
	expect(narrow[3]).toBeCloseTo(350, 0);
	const tiny = await widths(80);
	for (let i = 0; i < 3; i++) expect(tiny[i]).toBeLessThanOrEqual(80);
});
