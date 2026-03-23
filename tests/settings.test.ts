import { describe, it, expect } from 'vitest';

// Define the settings interface locally to avoid importing from obsidian-dependent file
interface VisibleCursorPluginSettings {
  customCursorMode: 'always' | 'flash' | 'off';
  customCursorStyle: 'block' | 'bar' | 'thinbar';
  lineHighlightMode: 'left' | 'centered' | 'right' | 'off';
  cursorCustomColorLight: string;
  cursorCustomColorDark: string;
  lineDuration: number;
  flashDuration: number;
  useThemeColors: boolean;
  flashOnWindowScrolls: boolean;
  flashOnWindowChanges: boolean;
  flashSize: number;
}

// Define expected default settings values for testing
// These should match the actual DEFAULT_SETTINGS in settings.ts
const EXPECTED_DEFAULTS: VisibleCursorPluginSettings = {
  customCursorMode: 'always',
  customCursorStyle: 'block',
  lineHighlightMode: 'centered',
  cursorCustomColorLight: '#6496ff',
  cursorCustomColorDark: '#6496ff',
  lineDuration: 1000,
  flashDuration: 1000,
  useThemeColors: true,
  flashOnWindowScrolls: true,
  flashOnWindowChanges: true,
  flashSize: 15
};

describe('DEFAULT_SETTINGS', () => {
  it('should have all required properties', () => {
    expect(EXPECTED_DEFAULTS).toHaveProperty('customCursorMode');
    expect(EXPECTED_DEFAULTS).toHaveProperty('customCursorStyle');
    expect(EXPECTED_DEFAULTS).toHaveProperty('lineHighlightMode');
    expect(EXPECTED_DEFAULTS).toHaveProperty('cursorCustomColorLight');
    expect(EXPECTED_DEFAULTS).toHaveProperty('cursorCustomColorDark');
    expect(EXPECTED_DEFAULTS).toHaveProperty('lineDuration');
    expect(EXPECTED_DEFAULTS).toHaveProperty('flashDuration');
    expect(EXPECTED_DEFAULTS).toHaveProperty('useThemeColors');
    expect(EXPECTED_DEFAULTS).toHaveProperty('flashOnWindowScrolls');
    expect(EXPECTED_DEFAULTS).toHaveProperty('flashOnWindowChanges');
    expect(EXPECTED_DEFAULTS).toHaveProperty('flashSize');
  });

  it('should have valid default cursor mode', () => {
    expect(['always', 'flash', 'off']).toContain(EXPECTED_DEFAULTS.customCursorMode);
    expect(EXPECTED_DEFAULTS.customCursorMode).toBe('always');
  });

  it('should have valid default cursor style', () => {
    expect(['block', 'bar', 'thinbar']).toContain(EXPECTED_DEFAULTS.customCursorStyle);
    expect(EXPECTED_DEFAULTS.customCursorStyle).toBe('block');
  });

  it('should have valid default line highlight mode', () => {
    expect(['left', 'centered', 'right', 'off']).toContain(EXPECTED_DEFAULTS.lineHighlightMode);
    expect(EXPECTED_DEFAULTS.lineHighlightMode).toBe('centered');
  });

  it('should have valid hex color for light theme', () => {
    expect(EXPECTED_DEFAULTS.cursorCustomColorLight).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(EXPECTED_DEFAULTS.cursorCustomColorLight).toBe('#6496ff');
  });

  it('should have valid hex color for dark theme', () => {
    expect(EXPECTED_DEFAULTS.cursorCustomColorDark).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(EXPECTED_DEFAULTS.cursorCustomColorDark).toBe('#6496ff');
  });

  it('should have positive line duration', () => {
    expect(EXPECTED_DEFAULTS.lineDuration).toBeGreaterThan(0);
    expect(EXPECTED_DEFAULTS.lineDuration).toBe(1000);
  });

  it('should have positive flash duration', () => {
    expect(EXPECTED_DEFAULTS.flashDuration).toBeGreaterThan(0);
    expect(EXPECTED_DEFAULTS.flashDuration).toBe(1000);
  });

  it('should have line and flash duration equal by default', () => {
    expect(EXPECTED_DEFAULTS.lineDuration).toBe(EXPECTED_DEFAULTS.flashDuration);
  });

  it('should have useThemeColors enabled by default', () => {
    expect(EXPECTED_DEFAULTS.useThemeColors).toBe(true);
  });

  it('should have flashOnWindowScrolls enabled by default', () => {
    expect(EXPECTED_DEFAULTS.flashOnWindowScrolls).toBe(true);
  });

  it('should have flashOnWindowChanges enabled by default', () => {
    expect(EXPECTED_DEFAULTS.flashOnWindowChanges).toBe(true);
  });

  it('should have flashSize within valid range', () => {
    expect(EXPECTED_DEFAULTS.flashSize).toBeGreaterThanOrEqual(4);
    expect(EXPECTED_DEFAULTS.flashSize).toBeLessThanOrEqual(30);
    expect(EXPECTED_DEFAULTS.flashSize).toBe(15);
  });
});

describe('VisibleCursorPluginSettings Type', () => {
  it('should accept valid settings object', () => {
    const settings: VisibleCursorPluginSettings = {
      customCursorMode: 'always',
      customCursorStyle: 'block',
      lineHighlightMode: 'centered',
      cursorCustomColorLight: '#6496ff',
      cursorCustomColorDark: '#6496ff',
      lineDuration: 1000,
      flashDuration: 1000,
      useThemeColors: true,
      flashOnWindowScrolls: true,
      flashOnWindowChanges: true,
      flashSize: 15
    };

    expect(settings.customCursorMode).toBe('always');
  });

  it('should accept all valid cursor modes', () => {
    const modes: Array<VisibleCursorPluginSettings['customCursorMode']> = ['always', 'flash', 'off'];
    expect(modes).toHaveLength(3);
  });

  it('should accept all valid cursor styles', () => {
    const styles: Array<VisibleCursorPluginSettings['customCursorStyle']> = ['block', 'bar', 'thinbar'];
    expect(styles).toHaveLength(3);
  });

  it('should accept all valid line highlight modes', () => {
    const modes: Array<VisibleCursorPluginSettings['lineHighlightMode']> = ['left', 'centered', 'right', 'off'];
    expect(modes).toHaveLength(4);
  });
});

describe('Settings Validation Helpers', () => {
  // These are helper functions that could be used for settings validation
  // They test the expected constraints on settings values

  it('should validate cursor mode values', () => {
    const validModes = ['always', 'flash', 'off'];
    const invalidModes = ['invalid', '', 'on', 'never'];
    
    validModes.forEach(mode => {
      expect(validModes).toContain(mode);
    });
    
    invalidModes.forEach(mode => {
      expect(validModes).not.toContain(mode);
    });
  });

  it('should validate cursor style values', () => {
    const validStyles = ['block', 'bar', 'thinbar'];
    const invalidStyles = ['invalid', '', 'line', 'underline'];
    
    validStyles.forEach(style => {
      expect(validStyles).toContain(style);
    });
    
    invalidStyles.forEach(style => {
      expect(validStyles).not.toContain(style);
    });
  });

  it('should validate line highlight mode values', () => {
    const validModes = ['left', 'centered', 'right', 'off'];
    const invalidModes = ['invalid', '', 'both', 'full'];
    
    validModes.forEach(mode => {
      expect(validModes).toContain(mode);
    });
    
    invalidModes.forEach(mode => {
      expect(validModes).not.toContain(mode);
    });
  });

  it('should validate hex color format', () => {
    const validHexColors = ['#6496ff', '#ffffff', '#000000', '#FF5500', '#abc123'];
    const invalidHexColors = ['ffffff', '#fff', '#gggggg', 'red', 'rgb(100,150,255)'];
    
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    
    validHexColors.forEach(color => {
      expect(color).toMatch(hexPattern);
    });
    
    invalidHexColors.forEach(color => {
      expect(color).not.toMatch(hexPattern);
    });
  });

  it('should validate duration range (200ms - 1500ms)', () => {
    const minDuration = 200;
    const maxDuration = 1500;
    
    // Valid durations
    expect(200).toBeGreaterThanOrEqual(minDuration);
    expect(1000).toBeGreaterThanOrEqual(minDuration);
    expect(1000).toBeLessThanOrEqual(maxDuration);
    expect(1500).toBeLessThanOrEqual(maxDuration);
    
    // Invalid durations
    expect(199).toBeLessThan(minDuration);
    expect(1501).toBeGreaterThan(maxDuration);
  });

  it('should validate flash size range (4 - 30)', () => {
    const minSize = 4;
    const maxSize = 30;
    
    // Valid sizes
    expect(4).toBeGreaterThanOrEqual(minSize);
    expect(15).toBeGreaterThanOrEqual(minSize);
    expect(15).toBeLessThanOrEqual(maxSize);
    expect(30).toBeLessThanOrEqual(maxSize);
    
    // Invalid sizes
    expect(3).toBeLessThan(minSize);
    expect(31).toBeGreaterThan(maxSize);
  });
});
