import { colorContrast, relativeLuminance } from 'commons/color';

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
export function hexToRgb(color: string): { r: number; g: number; b: number } {
	if (!color || typeof color !== 'string') {
		return { r: 100, g: 150, b: 255 };
	}
	const trimmed = color.trim().toLowerCase();

	// RGB or RGBA functional notation
	if (trimmed.startsWith('rgb')) {
		const match = trimmed.match(/^rgba?\s*\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)/);
		if (match) {
			const parseVal = (val: string) => {
				if (val.endsWith('%')) {
					return Math.min(255, Math.max(0, Math.round((parseFloat(val) / 100) * 255)));
				}
				return Math.min(255, Math.max(0, Math.round(parseFloat(val))));
			};
			return {
				r: parseVal(match[1]),
				g: parseVal(match[2]),
				b: parseVal(match[3]),
			};
		}
	}

	// Hex notation
	let cleanHex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
	if (/^[0-9a-f]{3,4}$/i.test(cleanHex)) {
		const r = parseInt(cleanHex[0] + cleanHex[0], 16);
		const g = parseInt(cleanHex[1] + cleanHex[1], 16);
		const b = parseInt(cleanHex[2] + cleanHex[2], 16);
		return { r, g, b };
	}
	if (/^[0-9a-f]{6,8}$/i.test(cleanHex)) {
		const r = parseInt(cleanHex.slice(0, 2), 16);
		const g = parseInt(cleanHex.slice(2, 4), 16);
		const b = parseInt(cleanHex.slice(4, 6), 16);
		return { r, g, b };
	}

	return { r: 100, g: 150, b: 255 };
}

/**
 * Calculate the relative luminance of a color according to WCAG
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
	return relativeLuminance({ r, g, b });
}

export type RGB = readonly [number, number, number];

/**
 * Calculate the contrast ratio between two colors according to WCAG
 */
export function contrastRatio(a: RGB, b: RGB): number {
	return colorContrast({ r: a[0], g: a[1], b: a[2] }, { r: b[0], g: b[1], b: b[2] });
}

export function getContrastRatio(color1: string, color2: string): number {
	const a = hexToRgb(color1);
	const b = hexToRgb(color2);
	return contrastRatio([a.r, a.g, a.b], [b.r, b.g, b.b]);
}


/**
 * Determine if an event target is inside an editor text DOM container
 */
export function isEditorTextClick(target: EventTarget | null): boolean {
	if (!target) return false;
	type ClickNode = EventTarget & {
		ownerDocument?: Document | null;
		parentElement?: HTMLElement | null;
		parentNode?: Node | null;
		classList?: DOMTokenList;
		className?: string | { baseVal?: unknown };
	};
	let curr: ClickNode | null = target;
	while (curr && curr !== activeDocument && curr !== curr.ownerDocument) {
		const className = curr.className;
		const classString = typeof className === "string"
			? className
			: typeof className?.baseVal === "string" ? className.baseVal : "";
		if (
			classString.split(/\s+/).some(classToken =>
				classToken === "cm-content" ||
				classToken === "cm-editor" ||
				classToken === "markdown-source-view"
			) ||
			curr.classList?.contains('cm-content') ||
			curr.classList?.contains('cm-editor') ||
			curr.classList?.contains('markdown-source-view')
		) {
			return true;
		}
		curr = (curr.parentElement ?? curr.parentNode) as ClickNode | null;
	}
	return false;
}

/**
 * Determine if a flash trigger should be allowed based on click fence and active flash state
 */
export function shouldAllowFlash(
	trigger: string,
	isFenceActive: boolean,
	isFlashActive: boolean,
	hasPendingFlash: boolean
): boolean {
	if (isFenceActive) {
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

