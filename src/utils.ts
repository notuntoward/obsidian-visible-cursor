/**
 * Utility functions for the Cursor Flash plugin
 * Extracted for testability
 */

/**
 * Apply backwards-compatibility migrations to a raw settings object loaded
 * from data.json.  The argument is mutated in-place and returned.
 *
 * @returns true if any migration was applied, false if settings were unchanged.
 *
 * Extracted as a pure function (no Obsidian imports) so it can be unit-tested
 * without an Obsidian plugin instance.
 */
export function migrateSettings(raw: Record<string, unknown>): boolean {
	let migrated = false;
	// Rename blockCursorMode -> customCursorMode  (pre-v1.0.x)
	if (raw.blockCursorMode !== undefined && raw.customCursorMode === undefined) {
		raw.customCursorMode = raw.blockCursorMode;
		delete raw.blockCursorMode;
		migrated = true;
	}
	// Rename blockCursorStyle -> customCursorStyle  (pre-v1.0.x)
	if (raw.blockCursorStyle !== undefined && raw.customCursorStyle === undefined) {
		raw.customCursorStyle = raw.blockCursorStyle;
		delete raw.blockCursorStyle;
		migrated = true;
	}
	// Rename thick-vertical cursor style -> bar  (v1.0.x)
	if (raw.customCursorStyle === 'thick-vertical') {
		raw.customCursorStyle = 'bar';
		migrated = true;
	}
	// Rename lineDuration -> flashDuration  (v1.0.15)
	if (raw.lineDuration !== undefined && raw.flashDuration === undefined) {
		raw.flashDuration = raw.lineDuration;
		delete raw.lineDuration;
		migrated = true;
	}
	return migrated;
}


/**
 * Convert a hex color string to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
	if (hex.startsWith('rgb')) {
		const matches = hex.match(/\d+/g);
		if (matches && matches.length >= 3) {
			return {
				r: parseInt(matches[0], 10),
				g: parseInt(matches[1], 10),
				b: parseInt(matches[2], 10)
			};
		}
	}
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
		  }
		: { r: 100, g: 150, b: 255 };
}

/**
 * Calculate the relative luminance of a color according to WCAG
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
	const rsRGB = r / 255;
	const gsRGB = g / 255;
	const bsRGB = b / 255;

	const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
	const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
	const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

	return 0.2126 * rLinear + 0.7150 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculate the contrast ratio between two colors according to WCAG
 */
export function getContrastRatio(color1: string, color2: string): number {
	const rgb1 = hexToRgb(color1);
	const rgb2 = hexToRgb(color2);

	const L1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
	const L2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

	const lighter = Math.max(L1, L2);
	const darker = Math.min(L1, L2);

	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Get the appropriate contrast color (text or background) for a given hex color
 */
export function getContrastColor(hexColor: string, bgColor: string = '#ffffff', textColor: string = '#000000'): string {
	let bgContrast = 1;
	let textContrast = 1;

	try {
		bgContrast = getContrastRatio(hexColor, bgColor);
	} catch (e) {
		// fallback to default contrast value
	}

	try {
		textContrast = getContrastRatio(hexColor, textColor);
	} catch (e) {
		// fallback to default contrast value
	}

	// Choose whichever has the highest contrast
	return textContrast > bgContrast ? textColor : bgColor;
}

/**
 * Calculate line height from font size
 */
export function calculateLineHeightFromFontSize(fontSize: number): number {
	return fontSize * 1.5;
}

/**
 * Calculate character width from font size
 */
export function calculateCharacterWidth(fontSize: number): number {
	return fontSize * 0.6;
}

/**
 * Calculate highlight distance based on flash size setting
 */
export function calculateHighlightDistance(flashSize: number, charWidth: number): number {
	return flashSize * charWidth;
}

/**
 * Calculate percentage of container width
 */
export function calculatePercentage(distance: number, containerWidth: number): number {
	return Math.min(100, (distance / containerWidth) * 100);
}

/**
 * Determine if a flash trigger should be allowed based on click fence and view triggers
 */
export function shouldAllowFlash(
	trigger: string,
	isFenceActive: boolean,
	isFlashActive: boolean,
	hasPendingFlash: boolean
): boolean {
	const isViewTrigger = trigger === 'view-change' || trigger === 'layout-change';
	
	// View/layout triggers bypass click fence
	if (!isViewTrigger && isFenceActive) {
		return false;
	}
	
	if (isFlashActive || hasPendingFlash) {
		return false;
	}
	
	return true;
}

/**
 * Determine debounce time based on scroll delta
 */
export function calculateScrollDebounceTime(scrollDelta: number): number {
	return scrollDelta < 5 ? 250 : 150;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	r /= 255;
	g /= 255;
	b /= 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}

	return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	h /= 360;
	s /= 100;
	l /= 100;

	let r: number, g: number, b: number;

	if (s === 0) {
		r = g = b = l;
	} else {
		const hue2rgb = (p: number, q: number, t: number): number => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}

	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255)
	};
}

/**
 * Adjust color for thin bar cursor to maintain visual weight.
 * Based on Stevens' Power Law: for a thinner line to have the same
 * perceived visual weight, we need to decrease lightness (make it darker).
 * 
 * For a 2px line vs 3px line (ratio 0.667), we reduce lightness by ~12%
 * to compensate for the reduced visual mass.
 * 
 * @param hexColor - The base color in hex format
 * @returns The adjusted color in hex format
 */
export function adjustColorForThinBar(hexColor: string): string {
	const rgb = hexToRgb(hexColor);
	const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
	
	// Reduce lightness by 12% to compensate for thinner width
	const adjustedL = Math.max(0, hsl.l - 12);
	
	const adjustedRgb = hslToRgb(hsl.h, hsl.s, adjustedL);
	
	return `#${adjustedRgb.r.toString(16).padStart(2, '0')}${adjustedRgb.g.toString(16).padStart(2, '0')}${adjustedRgb.b.toString(16).padStart(2, '0')}`;
}

