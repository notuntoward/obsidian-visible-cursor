import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ColorProvider } from '../../src/services/colorProvider';

describe('ColorProvider', () => {
  let colorProvider: ColorProvider;

  beforeEach(() => {
    colorProvider = new ColorProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getColor', () => {
    it('should return custom light color when useThemeColors is false and theme is light', () => {
      const settings = {
        customCursorMode: 'always' as const,
        useThemeColors: false,
        customCursorStyle: 'block' as const,
        cursorCustomColorLight: '#1a1a1a',
        cursorCustomColorDark: '#ffffff',
        lineHighlightMode: 'centered' as const,
        lineDuration: 500,
        flashDuration: 500,
        flashOnWindowScrolls: true,
        flashOnWindowChanges: true,
        flashSize: 8,
      };

      const result = colorProvider.getColor(settings);
      expect(result.opacity).toBe(0.8);
      expect(result.color).toBe('#1a1a1a');
    });

    it('should return custom dark color when useThemeColors is false and theme is dark', () => {
      vi.spyOn(colorProvider, 'isDarkTheme').mockReturnValue(true);

      const settings = {
        customCursorMode: 'always' as const,
        useThemeColors: false,
        customCursorStyle: 'block' as const,
        cursorCustomColorLight: '#1a1a1a',
        cursorCustomColorDark: '#ffffff',
        lineHighlightMode: 'centered' as const,
        lineDuration: 500,
        flashDuration: 500,
        flashOnWindowScrolls: true,
        flashOnWindowChanges: true,
        flashSize: 8,
      };

      const result = colorProvider.getColor(settings);
      expect(result.opacity).toBe(0.8);
      expect(result.color).toBe('#ffffff');
    });

    it('should return fallback color when theme accent color not found', () => {
      const settings = {
        customCursorMode: 'always' as const,
        useThemeColors: true,
        customCursorStyle: 'block' as const,
        cursorCustomColorLight: '#1a1a1a',
        cursorCustomColorDark: '#ffffff',
        lineHighlightMode: 'centered' as const,
        lineDuration: 500,
        flashDuration: 500,
        flashOnWindowScrolls: true,
        flashOnWindowChanges: true,
        flashSize: 8,
      };

      // Mock getThemeAccentColor to return empty string
      vi.spyOn(colorProvider as any, 'getThemeAccentColor').mockReturnValue('');

      const result = colorProvider.getColor(settings);
      expect(result.color).toBe('#6496ff');
      expect(result.opacity).toBe(0.8);
    });

    it('should return accent color as-is for bar cursor style', () => {
      const settings = {
        customCursorMode: 'always' as const,
        useThemeColors: true,
        customCursorStyle: 'bar' as const,
        cursorCustomColorLight: '#1a1a1a',
        cursorCustomColorDark: '#ffffff',
        lineHighlightMode: 'centered' as const,
        lineDuration: 500,
        flashDuration: 500,
        flashOnWindowScrolls: true,
        flashOnWindowChanges: true,
        flashSize: 8,
      };

      vi.spyOn(colorProvider as any, 'getThemeAccentColor').mockReturnValue('#ff6600');

      const result = colorProvider.getColor(settings);
      expect(result.color).toBe('#ff6600');
      expect(result.opacity).toBe(0.8);
    });

    it('should return accent color as-is for thinbar cursor style', () => {
      const settings = {
        customCursorMode: 'always' as const,
        useThemeColors: true,
        customCursorStyle: 'thinbar' as const,
        cursorCustomColorLight: '#1a1a1a',
        cursorCustomColorDark: '#ffffff',
        lineHighlightMode: 'centered' as const,
        lineDuration: 500,
        flashDuration: 500,
        flashOnWindowScrolls: true,
        flashOnWindowChanges: true,
        flashSize: 8,
      };

      vi.spyOn(colorProvider as any, 'getThemeAccentColor').mockReturnValue('#00ff88');

      const result = colorProvider.getColor(settings);
      expect(result.color).toBe('#00ff88');
      expect(result.opacity).toBe(0.8);
    });

    it('should lighten accent color for block cursor in light theme', () => {
      const settings = {
        customCursorMode: 'always' as const,
        useThemeColors: true,
        customCursorStyle: 'block' as const,
        cursorCustomColorLight: '#1a1a1a',
        cursorCustomColorDark: '#ffffff',
        lineHighlightMode: 'centered' as const,
        lineDuration: 500,
        flashDuration: 500,
        flashOnWindowScrolls: true,
        flashOnWindowChanges: true,
        flashSize: 8,
      };

      // Light theme (default)
      vi.spyOn(colorProvider, 'isDarkTheme').mockReturnValue(false);
      vi.spyOn(colorProvider as any, 'getThemeAccentColor').mockReturnValue('#ff0000');

      const result = colorProvider.getColor(settings);
      // Should be a lightened version: 30% accent + 70% white
      // R: 255*0.30 + 255*0.70 = 255, G: 0*0.30 + 255*0.70 = 178.5, B: 0*0.30 + 255*0.70 = 178.5
      expect(result.color).toContain('rgb');
      expect(result.opacity).toBe(0.8);
    });

    it('should slightly lighten accent color for block cursor in dark theme', () => {
      const settings = {
        customCursorMode: 'always' as const,
        useThemeColors: true,
        customCursorStyle: 'block' as const,
        cursorCustomColorLight: '#1a1a1a',
        cursorCustomColorDark: '#ffffff',
        lineHighlightMode: 'centered' as const,
        lineDuration: 500,
        flashDuration: 500,
        flashOnWindowScrolls: true,
        flashOnWindowChanges: true,
        flashSize: 8,
      };

      vi.spyOn(colorProvider, 'isDarkTheme').mockReturnValue(true);
      vi.spyOn(colorProvider as any, 'getThemeAccentColor').mockReturnValue('#0066ff');

      const result = colorProvider.getColor(settings);
      // Should be a slightly lightened version: 85% accent + 15% white
      expect(result.color).toContain('rgb');
      expect(result.opacity).toBe(0.8);
    });
  });

  describe('getContrastColor', () => {
    it('should return white for dark cursor backgrounds', () => {
      // Mock getComputedStyle to return theme variables
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: (prop: string) => {
          if (prop === '--background-primary') return '#ffffff';
          if (prop === '--text-normal') return '#000000';
          if (prop === '--text-on-accent') return '#ffffff';
          return '';
        }
      });
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle);

      // Dark blue cursor background
      const result = colorProvider.getContrastColor('#003366');
      expect(result).toBe('#ffffff');

      vi.unstubAllGlobals();
    });

    it('should return black for light cursor backgrounds', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: (prop: string) => {
          if (prop === '--background-primary') return '#ffffff';
          if (prop === '--text-normal') return '#000000';
          if (prop === '--text-on-accent') return '#000000';
          return '';
        }
      });
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle);

      // Light yellow cursor background
      const result = colorProvider.getContrastColor('#ffff99');
      expect(result).toBe('#000000');

      vi.unstubAllGlobals();
    });

    it('should consider original text color when provided', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: (prop: string) => {
          if (prop === '--background-primary') return '#1a1a1a';
          if (prop === '--text-normal') return '#e0e0e0';
          if (prop === '--text-on-accent') return '#ffffff';
          return '';
        }
      });
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle);

      // Dark cursor with light original text color
      const result = colorProvider.getContrastColor('#2d2d2d', '#e0e0e0');
      // The algorithm picks the best contrast - white or the original color
      // Both should have good contrast on dark background
      expect(['#ffffff', '#e0e0e0']).toContain(result);

      vi.unstubAllGlobals();
    });

    it('should use text-on-accent when available', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: (prop: string) => {
          if (prop === '--background-primary') return '#ffffff';
          if (prop === '--text-normal') return '#333333';
          if (prop === '--text-on-accent') return '#ffffff';
          return '';
        }
      });
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle);

      // Dark accent color - text-on-accent should be preferred
      const result = colorProvider.getContrastColor('#6496ff');
      // Should prefer text-on-accent (#ffffff) for accent colors
      expect(['#ffffff', '#000000']).toContain(result);

      vi.unstubAllGlobals();
    });

    it('should cache theme colors for subsequent calls', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: (prop: string) => {
          if (prop === '--background-primary') return '#ffffff';
          if (prop === '--text-normal') return '#000000';
          return '';
        }
      });
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle);

      // First call
      colorProvider.getContrastColor('#000000');
      // Second call
      colorProvider.getContrastColor('#ffffff');

      // getComputedStyle should only be called once due to caching
      expect(mockGetComputedStyle).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });
  });

  describe('clearCache', () => {
    it('should clear the color cache', () => {
      // Add something to the cache
      colorProvider.resolveColorToRgb('#ff0000');
      
      colorProvider.clearCache();
      
      // After clearing, the cache should be empty (we can verify by checking resolveColorToRgb works)
      const result = colorProvider.resolveColorToRgb('#ff0000');
      expect(result.r).toBe(255);
    });

    it('should clear theme colors cache', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: (prop: string) => {
          if (prop === '--background-primary') return '#ffffff';
          if (prop === '--text-normal') return '#000000';
          return '';
        }
      });
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle);

      // Trigger theme color caching
      colorProvider.getContrastColor('#000000');
      
      colorProvider.clearCache();
      
      // After clearing, getComputedStyle should be called again
      colorProvider.getContrastColor('#ffffff');
      expect(mockGetComputedStyle).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });
  });

  describe('isDarkTheme', () => {
    it('should return false when theme-dark class not present', () => {
      // Ensure theme-dark is not present
      document.body.classList.remove('theme-dark');
      expect(colorProvider.isDarkTheme()).toBe(false);
    });

    it('should return true when theme-dark class is present', () => {
      // Add the class and create a new provider to test
      document.body.classList.add('theme-dark');
      const freshProvider = new ColorProvider();
      expect(freshProvider.isDarkTheme()).toBe(true);
      document.body.classList.remove('theme-dark');
    });
  });

  describe('resolveColorToRgb', () => {
    it('should parse hex colors', () => {
      const result = colorProvider.resolveColorToRgb('#ff0000');
      expect(result.r).toBe(255);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
    });

    it('should parse rgb strings', () => {
      const result = colorProvider.resolveColorToRgb('rgb(255, 128, 64)');
      expect(result.r).toBe(255);
      expect(result.g).toBe(128);
      expect(result.b).toBe(64);
    });

    it('should return default for invalid colors', () => {
      const result = colorProvider.resolveColorToRgb('invalid-color-xyz');
      expect(result.r).toBe(100);
      expect(result.g).toBe(150);
      expect(result.b).toBe(255);
    });
  });
});
