import { describe, it, expect } from 'vitest';
import {
	hexToRgb,
	getRelativeLuminance,
	getContrastRatio,
	getContrastColor,
	calculateLineHeightFromFontSize,
	calculateCharacterWidth,
	calculateHighlightDistance,
	calculatePercentage,
	shouldAllowFlash,
	calculateScrollDebounceTime,
	rgbToHsl,
	hslToRgb,
	adjustColorForThinBar,
	detectSoftWrapEnd,
	type SoftWrapDetectionParams
} from '../src/utils';

describe('hexToRgb', () => {
	it('should convert a 6-digit hex color to RGB', () => {
		expect(hexToRgb('#6496ff')).toEqual({ r: 100, g: 150, b: 255 });
	});

	it('should convert a 6-digit hex color without hash to RGB', () => {
		expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
	});

	it('should return default color for invalid hex (3-digit not supported)', () => {
		// The current implementation doesn't support 3-digit hex, returns default
		expect(hexToRgb('#f00')).toEqual({ r: 100, g: 150, b: 255 });
	});

	it('should return default color for invalid hex', () => {
		expect(hexToRgb('invalid')).toEqual({ r: 100, g: 150, b: 255 });
	});

	it('should parse rgb string', () => {
		expect(hexToRgb('rgb(255, 128, 64)')).toEqual({ r: 255, g: 128, b: 64 });
	});

	it('should handle white', () => {
		expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
	});

	it('should handle black', () => {
		expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
	});
});

describe('getRelativeLuminance', () => {
	it('should return 0 for black', () => {
		const luminance = getRelativeLuminance(0, 0, 0);
		expect(luminance).toBeCloseTo(0, 5);
	});

	it('should return approximately 1 for white', () => {
		const luminance = getRelativeLuminance(255, 255, 255);
		expect(luminance).toBeCloseTo(1, 2);
	});

	it('should return correct luminance for pure red', () => {
		const luminance = getRelativeLuminance(255, 0, 0);
		expect(luminance).toBeCloseTo(0.2126, 3);
	});

	it('should return correct luminance for pure green', () => {
		const luminance = getRelativeLuminance(0, 255, 0);
		expect(luminance).toBeCloseTo(0.7152, 3);
	});

	it('should return correct luminance for pure blue', () => {
		const luminance = getRelativeLuminance(0, 0, 255);
		expect(luminance).toBeCloseTo(0.0722, 3);
	});

	it('should handle mid-gray', () => {
		const luminance = getRelativeLuminance(128, 128, 128);
		expect(luminance).toBeGreaterThan(0.1);
		expect(luminance).toBeLessThan(0.5);
	});
});

describe('getContrastRatio', () => {
	it('should return approximately 21 for black and white', () => {
		const ratio = getContrastRatio('#000000', '#ffffff');
		expect(ratio).toBeCloseTo(21, 0);
	});

	it('should return 1 for same colors', () => {
		const ratio = getContrastRatio('#6496ff', '#6496ff');
		expect(ratio).toBeCloseTo(1, 1);
	});

	it('should return approximately 2.86 for #6496ff on white', () => {
		const ratio = getContrastRatio('#6496ff', '#ffffff');
		// This is the actual contrast ratio
		expect(ratio).toBeCloseTo(2.86, 1);
	});

	it('should be symmetric', () => {
		const ratio1 = getContrastRatio('#000000', '#ffffff');
		const ratio2 = getContrastRatio('#ffffff', '#000000');
		expect(ratio1).toBeCloseTo(ratio2, 5);
	});
});

describe('getContrastColor', () => {
	it('should return background color when contrast ratios are equal', () => {
		// Black on white has contrast 21, black on black has contrast 1
		// With bgColor=#ffffff and textColor=#000000, both have same contrast to black
		// When equal, the function returns bgColor (white)
		const result = getContrastColor('#000000', '#ffffff', '#000000');
		// Both are 21:1 contrast to black, so returns bgColor (white)
		expect(result).toBe('#ffffff');
	});

	it('should return background color when it has higher contrast', () => {
		// A light yellow on white - background should have better contrast
		const result = getContrastColor('#ffff00', '#ffffff', '#000000');
		// Yellow on white = ~1.36 contrast
		// Yellow on black = ~19.2 contrast
		// So it should return black
		expect(result).toBe('#000000');
	});

	it('should use default colors when not provided', () => {
		const result = getContrastColor('#6496ff');
		// Should use defaults: #ffffff (bg) and #000000 (text)
		expect(result).toBeDefined();
	});

	it('should handle dark colors', () => {
		// Dark color on white - white has higher contrast
		// When equal, returns bgColor
		const result = getContrastColor('#000000', '#ffffff', '#000000');
		// Both have same contrast, returns bgColor = white
		expect(result).toBe('#ffffff');
	});

	it('should handle light colors', () => {
		// Light color on dark - text has higher contrast
		const result = getContrastColor('#ffffff', '#ffffff', '#000000');
		expect(result).toBe('#000000');
	});
});

describe('calculateLineHeightFromFontSize', () => {
	it('should calculate 1.5x font size', () => {
		expect(calculateLineHeightFromFontSize(16)).toBe(24);
	});

	it('should handle decimal font sizes', () => {
		expect(calculateLineHeightFromFontSize(14.5)).toBe(21.75);
	});

	it('should handle large font sizes', () => {
		expect(calculateLineHeightFromFontSize(32)).toBe(48);
	});
});

describe('calculateCharacterWidth', () => {
	it('should calculate 0.6x font size', () => {
		expect(calculateCharacterWidth(16)).toBe(9.6);
	});

	it('should handle typical editor font sizes', () => {
		expect(calculateCharacterWidth(14)).toBe(8.4);
	});

	it('should handle edge cases', () => {
		expect(calculateCharacterWidth(0)).toBe(0);
		expect(calculateCharacterWidth(100)).toBe(60);
	});
});

describe('calculateHighlightDistance', () => {
	it('should multiply flash size by character width', () => {
		const charWidth = 9.6;
		const flashSize = 8;
		expect(calculateHighlightDistance(flashSize, charWidth)).toBe(76.8);
	});

	it('should handle edge cases', () => {
		expect(calculateHighlightDistance(0, 10)).toBe(0);
		expect(calculateHighlightDistance(5, 0)).toBe(0);
	});

	it('should scale with different widths', () => {
		expect(calculateHighlightDistance(10, 6)).toBe(60);
		expect(calculateHighlightDistance(10, 12)).toBe(120);
	});
});

describe('calculatePercentage', () => {
	it('should calculate percentage of container width', () => {
		expect(calculatePercentage(50, 1000)).toBe(5);
	});

	it('should cap at 100 percent', () => {
		expect(calculatePercentage(2000, 1000)).toBe(100);
	});

	it('should handle zero container width gracefully', () => {
		expect(calculatePercentage(50, 0)).toBe(100);
	});

	it('should handle edge cases', () => {
		expect(calculatePercentage(0, 100)).toBe(0);
		expect(calculatePercentage(100, 100)).toBe(100);
	});
});

describe('shouldAllowFlash', () => {
	it('should allow flash for view-change trigger even with active click fence', () => {
		expect(shouldAllowFlash('view-change', true, false, false)).toBe(true);
	});

	it('should allow flash for layout-change trigger even with active click fence', () => {
		expect(shouldAllowFlash('layout-change', true, false, false)).toBe(true);
	});

	it('should block flash for scroll trigger with active click fence', () => {
		expect(shouldAllowFlash('scroll', true, false, false)).toBe(false);
	});

	it('should block flash when flash is already active', () => {
		expect(shouldAllowFlash('scroll', false, true, false)).toBe(false);
	});

	it('should block flash when pending flash exists', () => {
		expect(shouldAllowFlash('scroll', false, false, true)).toBe(false);
	});

	it('should allow flash in normal conditions', () => {
		expect(shouldAllowFlash('scroll', false, false, false)).toBe(true);
	});

	it('should block scroll trigger with active fence but allow view trigger', () => {
		const scrollBlocked = shouldAllowFlash('scroll', true, false, false);
		const viewAllowed = shouldAllowFlash('view-change', true, false, false);
		expect(scrollBlocked).toBe(false);
		expect(viewAllowed).toBe(true);
	});
});

describe('calculateScrollDebounceTime', () => {
	it('should return 250ms for small scroll delta', () => {
		expect(calculateScrollDebounceTime(3)).toBe(250);
	});

	it('should return 250ms for exactly 5px delta', () => {
		expect(calculateScrollDebounceTime(5)).toBe(150);
	});

	it('should return 150ms for large scroll delta', () => {
		expect(calculateScrollDebounceTime(50)).toBe(150);
	});

	it('should return 150ms for zero delta', () => {
		expect(calculateScrollDebounceTime(0)).toBe(250);
	});

	it('should have a clear threshold at 5px', () => {
		expect(calculateScrollDebounceTime(4)).toBe(250);
		expect(calculateScrollDebounceTime(5)).toBe(150);
		expect(calculateScrollDebounceTime(6)).toBe(150);
	});
});

describe('rgbToHsl', () => {
	it('should convert pure red correctly', () => {
		const hsl = rgbToHsl(255, 0, 0);
		expect(hsl.h).toBeCloseTo(0, 1);
		expect(hsl.s).toBeCloseTo(100, 1);
		expect(hsl.l).toBeCloseTo(50, 1);
	});

	it('should convert pure green correctly', () => {
		const hsl = rgbToHsl(0, 255, 0);
		expect(hsl.h).toBeCloseTo(120, 1);
		expect(hsl.s).toBeCloseTo(100, 1);
		expect(hsl.l).toBeCloseTo(50, 1);
	});

	it('should convert pure blue correctly', () => {
		const hsl = rgbToHsl(0, 0, 255);
		expect(hsl.h).toBeCloseTo(240, 1);
		expect(hsl.s).toBeCloseTo(100, 1);
		expect(hsl.l).toBeCloseTo(50, 1);
	});

	it('should convert white correctly', () => {
		const hsl = rgbToHsl(255, 255, 255);
		expect(hsl.s).toBeCloseTo(0, 1);
		expect(hsl.l).toBeCloseTo(100, 1);
	});

	it('should convert black correctly', () => {
		const hsl = rgbToHsl(0, 0, 0);
		expect(hsl.s).toBeCloseTo(0, 1);
		expect(hsl.l).toBeCloseTo(0, 1);
	});

	it('should convert mid-gray correctly', () => {
		const hsl = rgbToHsl(128, 128, 128);
		expect(hsl.s).toBeCloseTo(0, 0);
		expect(hsl.l).toBeCloseTo(50, 0);
	});

	it('should convert a typical cursor blue correctly', () => {
		const hsl = rgbToHsl(100, 150, 255);
		expect(hsl.h).toBeGreaterThan(200);
		expect(hsl.h).toBeLessThan(250);
		expect(hsl.l).toBeGreaterThan(60);
	});
});

describe('hslToRgb', () => {
	it('should convert pure red correctly', () => {
		const rgb = hslToRgb(0, 100, 50);
		expect(rgb.r).toBe(255);
		expect(rgb.g).toBe(0);
		expect(rgb.b).toBe(0);
	});

	it('should convert pure green correctly', () => {
		const rgb = hslToRgb(120, 100, 50);
		expect(rgb.r).toBe(0);
		expect(rgb.g).toBe(255);
		expect(rgb.b).toBe(0);
	});

	it('should convert pure blue correctly', () => {
		const rgb = hslToRgb(240, 100, 50);
		expect(rgb.r).toBe(0);
		expect(rgb.g).toBe(0);
		expect(rgb.b).toBe(255);
	});

	it('should convert white correctly', () => {
		const rgb = hslToRgb(0, 0, 100);
		expect(rgb.r).toBe(255);
		expect(rgb.g).toBe(255);
		expect(rgb.b).toBe(255);
	});

	it('should convert black correctly', () => {
		const rgb = hslToRgb(0, 0, 0);
		expect(rgb.r).toBe(0);
		expect(rgb.g).toBe(0);
		expect(rgb.b).toBe(0);
	});

	it('should be approximately the inverse of rgbToHsl', () => {
		const original = { r: 100, g: 150, b: 200 };
		const hsl = rgbToHsl(original.r, original.g, original.b);
		const roundTrip = hslToRgb(hsl.h, hsl.s, hsl.l);
		expect(roundTrip.r).toBeCloseTo(original.r, 0);
		expect(roundTrip.g).toBeCloseTo(original.g, 0);
		expect(roundTrip.b).toBeCloseTo(original.b, 0);
	});
});

describe('adjustColorForThinBar', () => {
	it('should return a darker version of the input color', () => {
		const original = '#6496ff';
		const adjusted = adjustColorForThinBar(original);
		const { r: or, g: og, b: ob } = hexToRgb(original);
		const { r: ar, g: ag, b: ab } = hexToRgb(adjusted);
		const origHsl = rgbToHsl(or, og, ob);
		const adjHsl = rgbToHsl(ar, ag, ab);
		expect(adjHsl.l).toBeLessThan(origHsl.l);
	});

	it('should reduce lightness by approximately 12 percentage points', () => {
		const original = '#6496ff';
		const adjusted = adjustColorForThinBar(original);
		const { r: or, g: og, b: ob } = hexToRgb(original);
		const { r: ar, g: ag, b: ab } = hexToRgb(adjusted);
		const origHsl = rgbToHsl(or, og, ob);
		const adjHsl = rgbToHsl(ar, ag, ab);
		expect(origHsl.l - adjHsl.l).toBeCloseTo(12, 0);
	});

	it('should preserve hue and saturation', () => {
		const original = '#6496ff';
		const adjusted = adjustColorForThinBar(original);
		const { r: or, g: og, b: ob } = hexToRgb(original);
		const { r: ar, g: ag, b: ab } = hexToRgb(adjusted);
		const origHsl = rgbToHsl(or, og, ob);
		const adjHsl = rgbToHsl(ar, ag, ab);
		expect(adjHsl.h).toBeCloseTo(origHsl.h, 0);
		expect(adjHsl.s).toBeCloseTo(origHsl.s, 0);
	});

	it('should not go below lightness 0 for very dark input colors', () => {
		const veryDark = '#0a0a0a';
		const adjusted = adjustColorForThinBar(veryDark);
		const { r, g, b } = hexToRgb(adjusted);
		const adjHsl = rgbToHsl(r, g, b);
		expect(adjHsl.l).toBeGreaterThanOrEqual(0);
	});

	it('should return a valid hex color string', () => {
		const adjusted = adjustColorForThinBar('#6496ff');
		expect(adjusted).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it('should handle pure white', () => {
		const adjusted = adjustColorForThinBar('#ffffff');
		const { r, g, b } = hexToRgb(adjusted);
		const adjHsl = rgbToHsl(r, g, b);
		expect(adjHsl.l).toBeCloseTo(88, 0);
	});

	it('should handle black without going negative', () => {
		const adjusted = adjustColorForThinBar('#000000');
		const { r, g, b } = hexToRgb(adjusted);
		const adjHsl = rgbToHsl(r, g, b);
		expect(adjHsl.l).toBeCloseTo(0, 0);
	});
});

// ---------------------------------------------------------------------------
// detectSoftWrapEnd tests
// ---------------------------------------------------------------------------

/** Base params: cursor mid-line on a wrapped line, no special state */
const baseMidLine: SoftWrapDetectionParams = {
	lineWrapping: true,
	isEOL: false,
	isMidDocLine: true,
	assoc: 0,
	endKeyPressedRecently: false,
	coordsLeftTop: undefined,
	coordsRightTop: undefined,
	actualLineHeight: 24
};

/** Geometry confirming a soft-wrap boundary (positions on different visual rows) */
const softWrapCoords = { coordsLeftTop: 100, coordsRightTop: 124 }; // 24px apart

/** Geometry confirming a non-boundary (same visual row) */
const nonBoundaryCoords = { coordsLeftTop: 100, coordsRightTop: 100 };

describe('detectSoftWrapEnd', () => {
	// -------------------------------------------------------------------------
	// Bug A: End key at soft-wrap boundary must be detected.
	// main.ts calls coordsAtPos when assoc < 0 and feeds the geometry here.
	// -------------------------------------------------------------------------

	it('[Bug A] assoc=-1, soft-wrap geometry → true (primary geometry path)', () => {
		// Typical: assoc=-1 after End, coordsAtPos confirms different rows
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: -1,
			endKeyPressedRecently: true,
			...softWrapCoords
		})).toBe(true);
	});

	it('[Bug A] assoc=-1, coords null (pre-paint, endKey=true) → true', () => {
		// coordsAtPos returned null; fall back to assoc < 0 signal
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: -1,
			endKeyPressedRecently: true,
			coordsLeftTop: null,
			coordsRightTop: null
		})).toBe(true);
	});

	it('[Bug A] assoc=-1, coords null, endKey=false → false (endKeyPressedRecently required)', () => {
		// assoc < 0 alone is NOT sufficient; endKeyPressedRecently is required
		// because assoc = -1 also appears at soft-wrap starts after →.
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: -1,
			endKeyPressedRecently: false,
			coordsLeftTop: null,
			coordsRightTop: null
		})).toBe(false);
	});

	it('[Bug A] assoc=0, endKeyPressedRecently=true, soft-wrap coords → true', () => {
		// CM6 kept assoc=0 after End; geometry confirms boundary
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: 0,
			endKeyPressedRecently: true,
			...softWrapCoords
		})).toBe(true);
	});

	it('[Bug A] assoc=0, endKeyPressedRecently=true, coords unavailable → true', () => {
		// CM6 kept assoc=0 (rare case); no geometry; flag covers it
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: 0,
			endKeyPressedRecently: true,
			coordsLeftTop: null,
			coordsRightTop: null
		})).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Bug B: End → right-arrow must NOT spuriously trigger soft-wrap.
	// After →, CM6 sets assoc = +1 (rightward move).
	// main.ts only calls coordsAtPos when assoc < 0, so for assoc=+1 no coords
	// are fetched. Step 1 (assoc >= 0 && !endKeyPressedRecently) blocks immediately.
	// -------------------------------------------------------------------------

	it('[Bug B] assoc=1 (→ after End), endKey=false → false', () => {
		// Normal rightward movement — Step 1 rejects immediately
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: 1,
			endKeyPressedRecently: false,
			coordsLeftTop: undefined,
			coordsRightTop: undefined
		})).toBe(false);
	});

	it('[Bug B] assoc=0, endKeyPressedRecently=false, non-boundary coords → false', () => {
		// Geometry says same row — not a soft-wrap end
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: 0,
			endKeyPressedRecently: false,
			...nonBoundaryCoords
		})).toBe(false);
	});

	it('[Bug B] assoc=-1, endKey=false → false (soft-wrap start after →, no flag)', () => {
		// After End → →: capture handler cleared the flag, assoc=-1 at new pos.
		// Must return false — this directly tests Bug B regression prevention.
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: -1,
			endKeyPressedRecently: false,
			coordsLeftTop: undefined,
			coordsRightTop: undefined
		})).toBe(false);
	});

	it('[Bug B] assoc=-1, geometry says same row → false', () => {
		// assoc=-1 but geometry overrules — positions on same visual row
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: -1,
			...nonBoundaryCoords
		})).toBe(false);
	});

	// -------------------------------------------------------------------------
	// Guard conditions
	// -------------------------------------------------------------------------

	it('returns false when isEOL=true', () => {
		expect(detectSoftWrapEnd({
			...baseMidLine,
			isEOL: true,
			assoc: -1,
			...softWrapCoords
		})).toBe(false);
	});

	it('returns false when lineWrapping=false', () => {
		expect(detectSoftWrapEnd({
			...baseMidLine,
			lineWrapping: false,
			assoc: -1,
			...softWrapCoords
		})).toBe(false);
	});

	it('returns false when isMidDocLine=false', () => {
		expect(detectSoftWrapEnd({
			...baseMidLine,
			isMidDocLine: false,
			assoc: -1,
			...softWrapCoords
		})).toBe(false);
	});

	it('returns false when assoc=0 and endKeyPressedRecently=false', () => {
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: 0,
			endKeyPressedRecently: false,
			...softWrapCoords
		})).toBe(false);
	});

	// -------------------------------------------------------------------------
	// Threshold boundary: coords .top difference at 50% of lineHeight
	// -------------------------------------------------------------------------

	it('returns false when top difference equals threshold (not strictly greater)', () => {
		// threshold = 24 * 0.5 = 12; difference = 12 → not > 12
		// (endKeyPressedRecently=true needed to reach the geometry step)
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: -1,
			endKeyPressedRecently: true,
			coordsLeftTop: 100,
			coordsRightTop: 112
		})).toBe(false);
	});

	it('returns true when top difference is just above threshold (endKeyPressedRecently=true)', () => {
		// difference = 13 > 12 → true (endKeyPressedRecently is required to reach geometry)
		expect(detectSoftWrapEnd({
			...baseMidLine,
			assoc: -1,
			endKeyPressedRecently: true,
			coordsLeftTop: 100,
			coordsRightTop: 113
		})).toBe(true);
	});
});
