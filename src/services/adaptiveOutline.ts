import { contrastRatio, type RGB } from '../utils';

export type RGBA = readonly [number, number, number, number];

export const OUTLINE_THRESHOLD_FLOOR = 1.1;
export const OUTLINE_THRESHOLD_CAP = 3;
export const BASELINE_DIVISOR = 2;
const HYSTERESIS = 0.1;

export function parseRgba(value: string): RGBA | null {
	const color = value.trim().toLowerCase();
	if (color === 'transparent') return [0, 0, 0, 0];
	if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(color)) {
		const hex = color.length <= 5
			? [...color.slice(1)].map(c => c + c).join('')
			: color.slice(1);
		return [
			parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16),
			parseInt(hex.slice(4, 6), 16), hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1,
		];
	}
	const match = /^rgba?\(([^()]+)\)$/.exec(color);
	if (!match) return null;
	const body = match[1].trim();
	let parts: string[];
	if (body.includes(',')) {
		parts = body.split(',').map(part => part.trim());
	} else {
		const sides = body.split('/');
		if (sides.length > 2) return null;
		parts = sides[0].trim().split(/\s+/);
		if (parts.length !== 3) return null;
		if (sides.length === 2) parts.push(sides[1].trim());
	}
	if (parts.length !== 3 && parts.length !== 4) return null;
	if (parts.some(p => !/^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(p))) return null;
	const channel = (part: string, max: number) =>
		Math.max(0, Math.min(max, part.endsWith('%') ? parseFloat(part) / 100 * max : parseFloat(part)));
	return [channel(parts[0], 255), channel(parts[1], 255), channel(parts[2], 255),
		parts.length === 4 ? channel(parts[3], 1) : 1];
}

export function composite(fg: RGBA, under: RGB): RGB {
	return [fg[0] * fg[3] + under[0] * (1 - fg[3]),
		fg[1] * fg[3] + under[1] * (1 - fg[3]),
		fg[2] * fg[3] + under[2] * (1 - fg[3])];
}

/** Layers are in front-to-back paint order. */
export function compositeLayers(layers: readonly RGBA[], base: RGB): RGB {
	return layers.reduceRight<RGB>((under, fg) => composite(fg, under), base);
}

export function outlineThreshold(baseline: number): number {
	return Math.max(OUTLINE_THRESHOLD_FLOOR, Math.min(OUTLINE_THRESHOLD_CAP, baseline / BASELINE_DIVISOR));
}

export function outlineState(local: number, threshold: number, previous: boolean): boolean {
	// Contrast cannot go below 1; scale the band above 1 so the floor can trigger.
	if (local < 1 + (threshold - 1) * (1 - HYSTERESIS)) return true;
	if (local > 1 + (threshold - 1) * (1 + HYSTERESIS)) return false;
	return previous;
}

export function chooseOutlineColor(fills: readonly RGB[], backgrounds: readonly RGB[]): string {
	const colors = [...fills, ...backgrounds];
	const score = (candidate: RGB) => Math.min(...colors.map(color => contrastRatio(candidate, color)));
	return score([255, 255, 255]) > score([0, 0, 0]) ? '#ffffff' : '#000000';
}

export function adaptiveOutline(fill: RGBA, editorBg: RGB, backgrounds: readonly RGB[], previous: boolean) {
	if (backgrounds.length === 0) throw new Error('Adaptive outline requires a background sample');
	const baseline = contrastRatio(composite(fill, editorBg), editorBg);
	const threshold = outlineThreshold(baseline);
	const fills = backgrounds.map(bg => composite(fill, bg));
	const local = Math.min(...backgrounds.map((bg, i) => contrastRatio(fills[i], bg)));
	const plain = backgrounds.every(bg => bg.every((channel, i) => Math.abs(channel - editorBg[i]) < 0.5));
	return {
		visible: !plain && outlineState(local, threshold, previous),
		color: chooseOutlineColor(fills, backgrounds),
		baseline, local, threshold,
	};
}
