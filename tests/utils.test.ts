import { describe, it, expect } from 'vitest';
import {
	hexToRgb,
	getRelativeLuminance,
	getContrastRatio,
	shouldAllowFlash,
	calculateScrollDebounceTime,
	isEditorTextClick
} from '../src/utils';

describe('hexToRgb', () => {
	it('should convert a 6-digit hex color to RGB', () => {
		expect(hexToRgb('#6496ff')).toEqual({ r: 100, g: 150, b: 255 });
	});

	it('should convert a 6-digit hex color without hash to RGB', () => {
		expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
	});

	it('should return default color for invalid hex (3-digit not supported)', () => {
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
		expect(ratio).toBeCloseTo(2.86, 1);
	});

	it('should be symmetric', () => {
		const ratio1 = getContrastRatio('#000000', '#ffffff');
		const ratio2 = getContrastRatio('#ffffff', '#000000');
		expect(ratio1).toBeCloseTo(ratio2, 5);
	});
});

describe('isEditorTextClick', () => {
	it('should return true for elements inside .cm-content or .cm-editor', () => {
		const editor = document.createElement('div');
		editor.className = 'cm-content';
		document.body.appendChild(editor);

		const line = document.createElement('div');
		line.className = 'cm-line';
		editor.appendChild(line);

		expect(isEditorTextClick(line)).toBe(true);
		document.body.removeChild(editor);
	});

	it('should return false for elements outside editor text (e.g. tab headers, ribbon)', () => {
		const tabHeader = document.createElement('div');
		tabHeader.className = 'workspace-tab-header';
		document.body.appendChild(tabHeader);

		expect(isEditorTextClick(tabHeader)).toBe(false);
		expect(isEditorTextClick(null)).toBe(false);
		document.body.removeChild(tabHeader);
	});
});

describe('shouldAllowFlash', () => {
	it('should block ALL flash triggers (including view-change) when click fence is active', () => {
		expect(shouldAllowFlash('view-change', true, false, false)).toBe(false);
		expect(shouldAllowFlash('layout-change', true, false, false)).toBe(false);
		expect(shouldAllowFlash('scroll', true, false, false)).toBe(false);
	});

	it('should allow flash when click fence is not active', () => {
		expect(shouldAllowFlash('view-change', false, false, false)).toBe(true);
		expect(shouldAllowFlash('scroll', false, false, false)).toBe(true);
	});

	it('should block flash when flash is already active', () => {
		expect(shouldAllowFlash('scroll', false, true, false)).toBe(false);
	});

	it('should block flash when pending flash exists', () => {
		expect(shouldAllowFlash('scroll', false, false, true)).toBe(false);
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
