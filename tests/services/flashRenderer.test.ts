import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FlashRenderer } from '../../src/services/flashRenderer';

describe('FlashRenderer Service', () => {
  let renderer: FlashRenderer;
  let appendedElements: HTMLElement[];

  beforeEach(() => {
    renderer = new FlashRenderer();
    appendedElements = [];
    
    // Track elements appended to document.body
    const originalAppendChild = document.body.appendChild;
    vi.spyOn(document.body, 'appendChild').mockImplementation((element: HTMLElement) => {
      appendedElements.push(element);
      return element;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('render', () => {
    it('should create and append a flash element to document.body', () => {
      const cssText = 'position: fixed; top: 100px;';
      renderer.render('left', cssText, 500);

      expect(document.body.appendChild).toHaveBeenCalledTimes(1);
      expect(appendedElements.length).toBe(1);
      expect(appendedElements[0].className).toBe('obsidian-flash-line');
    });

    it('should apply the provided CSS text to the element', () => {
      const cssText = 'position: fixed; top: 100px; left: 50px;';
      renderer.render('left', cssText, 500);

      const element = appendedElements[0];
      expect(element.style.cssText).toBe(cssText);
    });

    it('should remove the element after the specified duration', async () => {
      vi.useFakeTimers();
      
      const cssText = 'position: fixed;';
      renderer.render('left', cssText, 500);

      const element = appendedElements[0];
      const removeSpy = vi.spyOn(element, 'remove');

      // Element should not be removed immediately
      expect(removeSpy).not.toHaveBeenCalled();

      // Advance time by 500ms
      vi.advanceTimersByTime(500);

      expect(removeSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should work with all gradient modes', () => {
      const modes: Array<'left' | 'right' | 'centered'> = ['left', 'right', 'centered'];
      
      modes.forEach(mode => {
        renderer.render(mode, 'position: fixed;', 300);
      });

      expect(document.body.appendChild).toHaveBeenCalledTimes(3);
    });
  });

  describe('buildLeftGradientCSS', () => {
    it('should build CSS for left-to-right gradient', () => {
      const position = { left: 100, top: 200 };
      const size = { width: 800, height: 24 };
      const gradient = {
        colorStop: 'rgba(100, 150, 255, 0.8)',
        fadePercent: 50,
        opacity: 0.8
      };

      const css = renderer.buildLeftGradientCSS(position, size, gradient);

      expect(css).toContain('position: fixed');
      expect(css).toContain('left: 100px');
      expect(css).toContain('top: 200px');
      expect(css).toContain('width: 800px');
      expect(css).toContain('height: 24px');
      expect(css).toContain('linear-gradient(to right');
      expect(css).toContain('pointer-events: none');
    });

    it('should include the color stop in gradient', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 100, height: 20 };
      const gradient = {
        colorStop: 'rgba(255, 0, 0, 0.5)',
        fadePercent: 30,
        opacity: 0.5
      };

      const css = renderer.buildLeftGradientCSS(position, size, gradient);

      expect(css).toContain('rgba(255, 0, 0, 0.5)');
    });

    it('should calculate fade position based on fadePercent', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 100, height: 20 };
      const gradient = {
        colorStop: 'rgba(0, 0, 0, 1)',
        fadePercent: 40,
        opacity: 1
      };

      const css = renderer.buildLeftGradientCSS(position, size, gradient);

      // Should include the fade percent in the gradient stops
      expect(css).toContain('40%');
    });
  });

  describe('buildRightGradientCSS', () => {
    it('should build CSS for right-to-left gradient', () => {
      const position = { left: 100, top: 200 };
      const size = { width: 800, height: 24 };
      const gradient = {
        colorStop: 'rgba(100, 150, 255, 0.8)',
        fadePercent: 50,
        opacity: 0.8
      };

      const css = renderer.buildRightGradientCSS(position, size, gradient);

      expect(css).toContain('position: fixed');
      expect(css).toContain('linear-gradient(to left');
      expect(css).toContain('pointer-events: none');
    });

    it('should mirror the left gradient direction', () => {
      const position = { left: 50, top: 100 };
      const size = { width: 500, height: 30 };
      const gradient = {
        colorStop: 'rgba(0, 128, 255, 0.6)',
        fadePercent: 25,
        opacity: 0.6
      };

      const leftCss = renderer.buildLeftGradientCSS(position, size, gradient);
      const rightCss = renderer.buildRightGradientCSS(position, size, gradient);

      // Both should have same position and size
      expect(leftCss).toContain('left: 50px');
      expect(rightCss).toContain('left: 50px');
      
      // But different gradient directions
      expect(leftCss).toContain('to right');
      expect(rightCss).toContain('to left');
    });
  });

  describe('buildCenteredGradientCSS', () => {
    it('should build CSS for centered gradient with cursor position', () => {
      const position = { left: 0, top: 100 };
      const size = { width: 800, height: 24 };
      const gradient = {
        colorStop: 'rgba(100, 150, 255, 0.8)',
        cursorPercent: 50,
        spreadPercent: 10,
        peakOpacity: 0.8,
        fadeOpacity: 0.6
      };

      const css = renderer.buildCenteredGradientCSS(position, size, gradient);

      expect(css).toContain('position: fixed');
      expect(css).toContain('linear-gradient(to right');
      expect(css).toContain('pointer-events: none');
    });

    it('should position peak at cursor location', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 1000, height: 20 };
      const gradient = {
        colorStop: 'rgba(255, 100, 50, 0.9)',
        cursorPercent: 30,
        spreadPercent: 5,
        peakOpacity: 0.9,
        fadeOpacity: 0.7
      };

      const css = renderer.buildCenteredGradientCSS(position, size, gradient);

      // Peak should be at cursorPercent
      expect(css).toContain('30%');
    });

    it('should calculate left and right edges from spread', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 100, height: 20 };
      const gradient = {
        colorStop: 'rgba(0, 0, 0, 1)',
        cursorPercent: 50,
        spreadPercent: 20,
        peakOpacity: 1,
        fadeOpacity: 0.5
      };

      const css = renderer.buildCenteredGradientCSS(position, size, gradient);

      // Left edge = cursorPercent - spreadPercent = 30
      // Right edge = cursorPercent + spreadPercent = 70
      expect(css).toContain('30%');
      expect(css).toContain('70%');
    });

    it('should clamp edges to valid range', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 100, height: 20 };
      
      // Cursor at 5% with 20% spread would go negative
      const gradient = {
        colorStop: 'rgba(0, 0, 0, 1)',
        cursorPercent: 5,
        spreadPercent: 20,
        peakOpacity: 1,
        fadeOpacity: 0.5
      };

      const css = renderer.buildCenteredGradientCSS(position, size, gradient);

      // Left edge should be clamped to 0
      expect(css).toContain('0%');
    });

    it('should clamp right edge to 100', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 100, height: 20 };
      
      // Cursor at 95% with 20% spread would exceed 100
      const gradient = {
        colorStop: 'rgba(0, 0, 0, 1)',
        cursorPercent: 95,
        spreadPercent: 20,
        peakOpacity: 1,
        fadeOpacity: 0.5
      };

      const css = renderer.buildCenteredGradientCSS(position, size, gradient);

      // Right edge should be clamped to 100
      expect(css).toContain('100%');
    });

    it('should include fade opacity in gradient stops', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 100, height: 20 };
      const gradient = {
        colorStop: 'rgba(100, 100, 100, 1)',
        cursorPercent: 50,
        spreadPercent: 10,
        peakOpacity: 1,
        fadeOpacity: 0.75
      };

      const css = renderer.buildCenteredGradientCSS(position, size, gradient);

      // Should contain the fade opacity value
      expect(css).toContain('0.75');
    });
  });

  describe('Integration - Complete Flash Rendering', () => {
    it('should render a complete left-to-right flash', () => {
      const position = { left: 100, top: 200 };
      const size = { width: 800, height: 24 };
      const gradient = {
        colorStop: 'rgba(100, 150, 255, 0.8)',
        fadePercent: 10,
        opacity: 0.8
      };

      const css = renderer.buildLeftGradientCSS(position, size, gradient);
      renderer.render('left', css, 500);

      expect(appendedElements[0].style.cssText).toBe(css);
    });

    it('should render a complete centered flash', () => {
      const position = { left: 0, top: 150 };
      const size = { width: 1000, height: 24 };
      const gradient = {
        colorStop: 'rgba(100, 150, 255, 0.8)',
        cursorPercent: 40,
        spreadPercent: 8,
        peakOpacity: 0.8,
        fadeOpacity: 0.6
      };

      const css = renderer.buildCenteredGradientCSS(position, size, gradient);
      renderer.render('centered', css, 300);

      expect(appendedElements[0].style.cssText).toBe(css);
    });
  });
});
