import { describe, expect, it } from 'vitest';
import {
	parseRgba, composite, compositeLayers, outlineThreshold, outlineState,
	chooseOutlineColor, adaptiveOutline,
} from '../../src/services/adaptiveOutline';
import { contrastRatio, type RGB } from '../../src/utils';

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

describe('adaptive block outline', () => {
	it.each([
		['rgb(12, 34, 56)', [12, 34, 56, 1]],
		['rgba(12, 34, 56, 0.5)', [12, 34, 56, 0.5]],
		['rgb(12 34 56)', [12, 34, 56, 1]],
		['rgb(12 34 56 / 25%)', [12, 34, 56, 0.25]],
		['rgba(12 34 56 / .5)', [12, 34, 56, 0.5]],
		['rgb(100% 0% 50% / 100%)', [255, 0, 127.5, 1]],
		['transparent', [0, 0, 0, 0]],
		['#abcd', [170, 187, 204, 221 / 255]],
		['#11223380', [17, 34, 51, 128 / 255]],
	])('parses %s with alpha intact', (value, expected) => {
		expect(parseRgba(value)).toEqual(expected);
	});

	it.each(['nonsense', 'rgb(12 34)', 'rgb(12 34 nope)', 'rgb(1 2 3 / NaN)',
		'rgb(1 2 3 /)', 'rgb(1,,2,3)', 'rgb(1 2 3 0.5)'])('rejects %s', value => {
		expect(parseRgba(value)).toBeNull();
	});

	it('composites one and two transparent layers, ordered top to bottom', () => {
		expect(composite([255, 255, 0, 0.5], WHITE)).toEqual([255, 255, 127.5]);
		expect(compositeLayers([[0, 0, 255, 0.5], [255, 255, 0, 0.5]], WHITE))
			.toEqual([127.5, 127.5, 191.25]);
	});

	it('uses the corrected WCAG luminance and keeps string helpers compatible', () => {
		expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
		expect(contrastRatio([0, 255, 0], BLACK)).toBeCloseTo((0.7152 + 0.05) / 0.05, 10);
	});

	it('calibrates threshold to the plain background, bounded by the named floor and cap', () => {
		expect(outlineThreshold(1.2)).toBe(1.1);
		expect(outlineThreshold(4)).toBe(2);
		expect(outlineThreshold(21)).toBe(3);
	});

	it('leaves a pastel cursor plain on the editor, but outlines an identical highlight', () => {
		const fill = [216, 204, 255, 1] as const;
		expect(adaptiveOutline(fill, WHITE, [WHITE], false).visible).toBe(false);
		expect(adaptiveOutline(fill, WHITE, [[216, 204, 255]], false).visible).toBe(true);
		expect(adaptiveOutline(fill, WHITE, [WHITE], true).visible).toBe(false);
	});

	it('composites the fill separately for baseline and local contrast', () => {
		const fill = [255, 255, 255, 0.5] as const;
		const result = adaptiveOutline(fill, BLACK, [WHITE], false);
		expect(result.baseline).toBeCloseTo(contrastRatio([127.5, 127.5, 127.5], BLACK));
		expect(result.local).toBe(1);
		expect(result.visible).toBe(true);
	});

	it('uses the least visible sample rather than just the center', () => {
		expect(adaptiveOutline([216, 204, 255, 1], WHITE, [WHITE, [216, 204, 255], BLACK], false).visible)
			.toBe(true);
	});

	it('chooses a black edge for light cells and white for dark cells', () => {
		expect(chooseOutlineColor([WHITE], [WHITE])).toBe('#000000');
		expect(chooseOutlineColor([BLACK], [BLACK])).toBe('#ffffff');
	});

	it('maximizes the worst contrast across the fill and every background sample', () => {
		const fills: RGB[] = [[128, 128, 128], [160, 160, 160]];
		const backgrounds: RGB[] = [[150, 150, 150], WHITE];
		const score = (candidate: RGB) => Math.min(...[...fills, ...backgrounds].map(c => contrastRatio(candidate, c)));
		const expected = score(WHITE) > score(BLACK) ? '#ffffff' : '#000000';
		expect(chooseOutlineColor(fills, backgrounds)).toBe(expected);
	});

	it('retains previous state inside the band and triggers even at the 1.1 floor', () => {
		expect(outlineState(2, 2, false)).toBe(false);
		expect(outlineState(2, 2, true)).toBe(true);
		expect(outlineState(1.8, 2, false)).toBe(true);
		expect(outlineState(2.2, 2, true)).toBe(false);
		expect(outlineState(1, 1.1, false)).toBe(true);
		expect(outlineState(1.1, 1.1, true)).toBe(true);
		expect(outlineState(1.12, 1.1, true)).toBe(false);
	});
});
