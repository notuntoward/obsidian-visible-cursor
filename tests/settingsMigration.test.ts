import { describe, it, expect } from 'vitest';
import { migrateSettings, hexToRgb } from '../src/utils';
import { FlashScheduler } from '../src/services/flashScheduler';

/**
 * Regression tests for settings migration paths.
 *
 * Each test pins a specific migration step that once caused a bug or was
 * introduced as part of a rename/refactor.  If a migration is accidentally
 * removed or broken, at least one of these tests will fail, making the
 * regression immediately visible.
 */
describe('migrateSettings', () => {
	describe('blockCursorMode to customCursorMode (pre-v1.0.x)', () => {
		it('should migrate blockCursorMode to customCursorMode', () => {
			const raw: Record<string, unknown> = { blockCursorMode: 'always' };
			migrateSettings(raw);
			expect(raw.customCursorMode).toBe('always');
			expect(raw.blockCursorMode).toBeUndefined();
		});

		it('should not overwrite an existing customCursorMode', () => {
			const raw: Record<string, unknown> = { blockCursorMode: 'flash', customCursorMode: 'off' };
			migrateSettings(raw);
			expect(raw.customCursorMode).toBe('off');
			expect(raw.blockCursorMode).toBe('flash'); // not consumed because customCursorMode already set
		});

		it('should be a no-op when neither key is present', () => {
			const raw: Record<string, unknown> = {};
			migrateSettings(raw);
			expect(raw.customCursorMode).toBeUndefined();
		});
	});

	describe('blockCursorStyle to customCursorStyle (pre-v1.0.x)', () => {
		it('should migrate blockCursorStyle to customCursorStyle', () => {
			const raw: Record<string, unknown> = { blockCursorStyle: 'bar' };
			migrateSettings(raw);
			expect(raw.customCursorStyle).toBe('bar');
			expect(raw.blockCursorStyle).toBeUndefined();
		});

		it('should not overwrite an existing customCursorStyle', () => {
			const raw: Record<string, unknown> = { blockCursorStyle: 'block', customCursorStyle: 'thinbar' };
			migrateSettings(raw);
			expect(raw.customCursorStyle).toBe('thinbar');
		});
	});

	describe('thick-vertical renamed to bar (v1.0.x)', () => {
		it('should rename thick-vertical cursor style to bar', () => {
			const raw: Record<string, unknown> = { customCursorStyle: 'thick-vertical' };
			migrateSettings(raw);
			expect(raw.customCursorStyle).toBe('bar');
		});

		it('should not change a valid cursor style', () => {
			for (const style of ['block', 'bar', 'thinbar']) {
				const raw: Record<string, unknown> = { customCursorStyle: style };
				migrateSettings(raw);
				expect(raw.customCursorStyle).toBe(style);
			}
		});
	});

	describe('lineDuration renamed to flashDuration (v1.0.15)', () => {
		it('should migrate lineDuration to flashDuration', () => {
			const raw: Record<string, unknown> = { lineDuration: 800 };
			migrateSettings(raw);
			expect(raw.flashDuration).toBe(800);
			expect(raw.lineDuration).toBeUndefined();
		});

		it('should not overwrite an existing flashDuration', () => {
			// If somehow both are present (e.g. corrupted data.json), prefer flashDuration
			const raw: Record<string, unknown> = { lineDuration: 800, flashDuration: 1200 };
			migrateSettings(raw);
			expect(raw.flashDuration).toBe(1200);
			expect(raw.lineDuration).toBe(800); // not consumed because flashDuration already set
		});

		it('should be a no-op when lineDuration is absent', () => {
			const raw: Record<string, unknown> = { flashDuration: 1000 };
			migrateSettings(raw);
			expect(raw.flashDuration).toBe(1000);
			expect(raw.lineDuration).toBeUndefined();
		});
	});

	describe('combined old-style data.json (full migration chain)', () => {
		it('should apply all migrations to a very old data.json in one pass', () => {
			const raw: Record<string, unknown> = {
				blockCursorMode: 'flash',
				blockCursorStyle: 'thick-vertical',
				lineDuration: 500,
				useThemeColors: false,
			};
			migrateSettings(raw);

			expect(raw.customCursorMode).toBe('flash');
			expect(raw.blockCursorMode).toBeUndefined();

			// thick-vertical is renamed to bar after blockCursorStyle is promoted
			expect(raw.customCursorStyle).toBe('bar');
			expect(raw.blockCursorStyle).toBeUndefined();

			expect(raw.flashDuration).toBe(500);
			expect(raw.lineDuration).toBeUndefined();

			expect(raw.useThemeColors).toBe(false); // unchanged field preserved
		});

		it('should be idempotent when run twice', () => {
			const raw: Record<string, unknown> = { lineDuration: 700 };
			migrateSettings(raw);
			migrateSettings(raw); // second pass — should not change anything
			expect(raw.flashDuration).toBe(700);
			expect(raw.lineDuration).toBeUndefined();
		});
	});
});

/**
 * Regression tests for hexToRgb edge cases.
 *
 * The function is called in every cursor render cycle via ColorProvider; an
 * unexpected return value causes the wrong colour to be shown.
 */
describe('hexToRgb edge cases', () => {
	it('should parse upper-case hex correctly', () => {
		const result = hexToRgb('#FF8800');
		expect(result).toEqual({ r: 255, g: 136, b: 0 });
	});

	it('should return the fallback for an invalid hex string', () => {
		const result = hexToRgb('#ZZZZZZ');
		// Fallback is the hard-coded blue used throughout the plugin
		expect(result).toEqual({ r: 100, g: 150, b: 255 });
	});

	it('should return the fallback for an empty string', () => {
		const result = hexToRgb('');
		expect(result).toEqual({ r: 100, g: 150, b: 255 });
	});

	it('should parse rgb() string with spaces', () => {
		const result = hexToRgb('rgb(10, 20, 30)');
		expect(result).toEqual({ r: 10, g: 20, b: 30 });
	});

	it('should parse rgba() string (alpha ignored)', () => {
		const result = hexToRgb('rgba(10, 20, 30, 0.5)');
		expect(result).toEqual({ r: 10, g: 20, b: 30 });
	});

	it('should parse #000000 correctly', () => {
		expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
	});

	it('should parse #ffffff correctly', () => {
		expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
	});
});

/**
 * Regression tests for FlashScheduler.canScheduleFlash timing gate.
 *
 * The 100ms minimum-between-non-view-flashes gate was added to prevent UI
 * slowdown from rapid successive flashes.  Tests pin the boundary conditions.
 */
describe('FlashScheduler.canScheduleFlash timing gate', () => {
	it('should block a non-view flash that arrives within 100ms of the last one', () => {
		const scheduler = new FlashScheduler();
		const now = Date.now();

		const blocked = scheduler.canScheduleFlash('scroll', {
			isFenceActive: false,
			isFlashActive: false,
			hasPendingFlash: false,
			lastViewChange: now - 50, // only 50ms ago
			now,
		});

		expect(blocked).toBe(false);
	});

	it('should allow a non-view flash that arrives more than 100ms after the last one', () => {
		const scheduler = new FlashScheduler();
		const now = Date.now();

		const allowed = scheduler.canScheduleFlash('scroll', {
			isFenceActive: false,
			isFlashActive: false,
			hasPendingFlash: false,
			lastViewChange: now - 200, // 200ms ago — past the gate
			now,
		});

		expect(allowed).toBe(true);
	});

	it('should bypass the timing gate for view-change triggers', () => {
		const scheduler = new FlashScheduler();
		const now = Date.now();

		// Even if the last change was 10ms ago, a view-change always gets through
		const allowed = scheduler.canScheduleFlash('view-change', {
			isFenceActive: false,
			isFlashActive: false,
			hasPendingFlash: false,
			lastViewChange: now - 10,
			now,
		});

		expect(allowed).toBe(true);
	});

	it('should bypass the timing gate for layout-change triggers', () => {
		const scheduler = new FlashScheduler();
		const now = Date.now();

		const allowed = scheduler.canScheduleFlash('layout-change', {
			isFenceActive: false,
			isFlashActive: false,
			hasPendingFlash: false,
			lastViewChange: now - 10,
			now,
		});

		expect(allowed).toBe(true);
	});

	it('should use exactly 100ms as the threshold boundary', () => {
		const scheduler = new FlashScheduler();
		const now = Date.now();

		// At exactly 100ms the condition is: now - lastViewChange < 100 → false → allowed
		const atBoundary = scheduler.canScheduleFlash('scroll', {
			isFenceActive: false,
			isFlashActive: false,
			hasPendingFlash: false,
			lastViewChange: now - 100,
			now,
		});
		expect(atBoundary).toBe(true);

		// At 99ms: now - lastViewChange < 100 → true → blocked
		const justBefore = scheduler.canScheduleFlash('scroll', {
			isFenceActive: false,
			isFlashActive: false,
			hasPendingFlash: false,
			lastViewChange: now - 99,
			now,
		});
		expect(justBefore).toBe(false);
	});
});
