import type { VisibleCursorPluginSettings } from '../../settings';
import {
  hexToRgb,
  getRelativeLuminance,
  getContrastRatio,
} from '../utils';

/**
 * Service for managing color operations
 * Encapsulates all color-related logic and theme detection
 * Pure functions - no Obsidian API dependencies
 */
export class ColorProvider {
  private colorCache: Map<string, { r: number; g: number; b: number }> = new Map();
  private themeColorsCache: {
    accent: string | null;
    bg: string | null;
    text: string | null;
    textOnAccent: string | null;
  } = { accent: null, bg: null, text: null, textOnAccent: null };

  /**
   * Clear the color cache (e.g., when theme changes)
   */
  clearCache(): void {
    this.colorCache.clear();
    this.themeColorsCache = { accent: null, bg: null, text: null, textOnAccent: null };
  }

  /**
   * Get the cursor color based on settings and theme
   */
  getColor(settings: VisibleCursorPluginSettings): { color: string; opacity: number } {
    if (!settings.useThemeColors) {
      return this.getCustomColor(settings);
    }

    const accentColor = this.getThemeAccentColor();
    if (!accentColor) {
      return { color: '#6496ff', opacity: 0.8 };
    }

    return this.getThemedColor(settings, accentColor);
  }

  /**
   * Resolve CSS colors (including color-mix, var(), etc.) to RGB values
   */
  resolveColorToRgb(color: string): { r: number; g: number; b: number } {
    if (this.colorCache.has(color)) {
      return this.colorCache.get(color)!;
    }

    // First try parsing as hex or rgb
    if (color.startsWith('#') || color.startsWith('rgb')) {
      const rgb = hexToRgb(color);
      this.colorCache.set(color, rgb);
      return rgb;
    }

    // For color-mix, var(), or other CSS functions, use a temporary element
    try {
      const temp = document.createElement('div');
      temp.style.cssText = `color: ${color}; display: none;`;
      document.body.appendChild(temp);
      const computed = getComputedStyle(temp).color;
      document.body.removeChild(temp);

      // Parse the computed rgb() or rgba() value
      const matches = computed.match(/\d+/g);
      if (matches && matches.length >= 3) {
        const rgb = {
          r: parseInt(matches[0]),
          g: parseInt(matches[1]),
          b: parseInt(matches[2]),
        };
        this.colorCache.set(color, rgb);
        return rgb;
      }
    } catch (e) {
      // Fall through to default
    }

    // Default fallback
    const defaultRgb = { r: 100, g: 150, b: 255 };
    this.colorCache.set(color, defaultRgb);
    return defaultRgb;
  }

  /**
   * Get the appropriate text color for a given background color
   * Uses WCAG contrast ratio calculations
   */
  getContrastColor(cursorBackgroundColor: string, originalTextColor?: string): string {
    if (this.themeColorsCache.bg === null) {
      const computedStyle = getComputedStyle(document.body);
      this.themeColorsCache.bg = computedStyle.getPropertyValue('--background-primary').trim() || '#ffffff';
      this.themeColorsCache.text = computedStyle.getPropertyValue('--text-normal').trim() || '#000000';
      this.themeColorsCache.textOnAccent = computedStyle.getPropertyValue('--text-on-accent').trim();
    }

    const bgColor = this.themeColorsCache.bg!;
    const textColor = this.themeColorsCache.text!;
    const textOnAccent = this.themeColorsCache.textOnAccent;

    // Resolve the cursor background color to RGB for contrast calculation
    const cursorRgb = this.resolveColorToRgb(cursorBackgroundColor);
    const resolvedCursorColor = `rgb(${cursorRgb.r}, ${cursorRgb.g}, ${cursorRgb.b})`;

    // Candidate text colors to try, in order of preference:
    // 0. The exact original color of the character (if provided)
    // 1. Theme's --text-on-accent (if available) - designed for text on accent colors
    // 2. White (#ffffff) - works well on dark/medium backgrounds
    // 3. Black (#000000) - works well on light backgrounds
    // 4. Theme's normal text color
    // 5. Theme's background color (inverted from normal)
    const candidates: { color: string; priority: number }[] = [];

    if (originalTextColor) {
      candidates.push({ color: originalTextColor, priority: 0 });
    }
    if (textOnAccent) {
      candidates.push({ color: textOnAccent, priority: 1 });
    }
    candidates.push({ color: '#ffffff', priority: 2 });
    candidates.push({ color: '#000000', priority: 3 });
    candidates.push({ color: textColor, priority: 4 });
    candidates.push({ color: bgColor, priority: 5 });

    // Calculate contrast ratios and find the best option
    let bestColor = '#ffffff';
    let bestContrast = 0;
    let bestPriority = Infinity;

    for (const candidate of candidates) {
      try {
        // Resolve candidate to RGB using our robust resolver
        const candidateRgb = this.resolveColorToRgb(candidate.color);
        const resolvedCandidate = `rgb(${candidateRgb.r}, ${candidateRgb.g}, ${candidateRgb.b})`;

        const contrast = getContrastRatio(resolvedCursorColor, resolvedCandidate);
        // Prefer higher contrast, but among similar contrast levels, prefer lower priority
        // Use a threshold of 0.5 to consider contrast "similar"
        if (contrast > bestContrast + 0.5 || (contrast > bestContrast - 0.5 && candidate.priority < bestPriority)) {
          bestContrast = contrast;
          bestColor = candidate.color;
          bestPriority = candidate.priority;
        }
      } catch (e) {
        // Skip invalid colors
      }
    }

    return bestColor;
  }

  /**
   * Check if current theme is dark
   */
  isDarkTheme(): boolean {
    return document.body.classList.contains('theme-dark');
  }

  /**
   * Get the theme's accent color
   */
  private getThemeAccentColor(): string {
    if (this.themeColorsCache.accent === null) {
      const style = getComputedStyle(document.body);
      this.themeColorsCache.accent = style.getPropertyValue('--interactive-accent').trim();
    }
    return this.themeColorsCache.accent;
  }

  /**
   * Get custom (non-theme) color based on current theme
   */
  private getCustomColor(settings: VisibleCursorPluginSettings): { color: string; opacity: number } {
    const isDark = this.isDarkTheme();
    const color = isDark ? settings.cursorCustomColorDark : settings.cursorCustomColorLight;
    return { color, opacity: 0.8 };
  }

  /**
   * Get themed color with adjustments for bar vs block style
   */
  private getThemedColor(
    settings: VisibleCursorPluginSettings,
    accentColor: string
  ): { color: string; opacity: number } {
    if (settings.customCursorStyle === 'bar' || settings.customCursorStyle === 'thinbar') {
      // Bar cursor: use accent as-is
      return { color: accentColor, opacity: 0.8 };
    }

    // Block cursor: adjust accent color for better text readability
    // We want a color that works well with either white or black text
    const isDark = this.isDarkTheme();
    const rgb = this.resolveColorToRgb(accentColor);

    if (isDark) {
      // Dark theme: lighten the accent slightly so white text is more readable
      // Mix 85% accent with 15% white for a slightly lighter background
      const r = Math.round(rgb.r * 0.85 + 255 * 0.15);
      const g = Math.round(rgb.g * 0.85 + 255 * 0.15);
      const b = Math.round(rgb.b * 0.85 + 255 * 0.15);
      return { color: `rgb(${r}, ${g}, ${b})`, opacity: 0.8 };
    } else {
      // Light theme: significantly lighten the accent so black text is readable
      // Mix 30% accent with 70% white for a light pastel background
      const r = Math.round(rgb.r * 0.30 + 255 * 0.70);
      const g = Math.round(rgb.g * 0.30 + 255 * 0.70);
      const b = Math.round(rgb.b * 0.30 + 255 * 0.70);
      return { color: `rgb(${r}, ${g}, ${b})`, opacity: 0.8 };
    }
  }
}
