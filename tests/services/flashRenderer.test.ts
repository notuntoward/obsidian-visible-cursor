import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FlashRenderer } from '../../src/services/flashRenderer';

describe('FlashRenderer Service', () => {
  let renderer: FlashRenderer;
  let appendedElements: HTMLElement[];

  beforeEach(() => {
    renderer = new FlashRenderer();
    appendedElements = [];
    
    // Track elements appended to document.body
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

    it('should append to custom parent element when provided', () => {
      const customParent = { appendChild: vi.fn() } as any;

      renderer.render('left', 'position: absolute;', 500, customParent);

      expect(customParent.appendChild).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildLeftGradientCSS', () => {
    it('should build CSS with position: absolute when specified', () => {
      const position = { left: 10, top: 20 };
      const size = { width: 400, height: 20 };
      const rgb = { r: 100, g: 150, b: 255 };
      const css = renderer.buildLeftGradientCSS(position, size, rgb, 0.8, 50, 500, 'absolute');

      expect(css).toContain('position: absolute');
    });
    it('should build CSS for left-to-right gradient', () => {
      const position = { left: 100, top: 200 };
      const size = { width: 800, height: 24 };
      const rgb = { r: 100, g: 150, b: 255 };
      const opacity = 0.8;
      const highlightPercent = 50;
      const duration = 500;

      const css = renderer.buildLeftGradientCSS(position, size, rgb, opacity, highlightPercent, duration);

      expect(css).toContain('position: fixed');
      expect(css).toContain('left: 100px');
      expect(css).toContain('top: 200px');
      expect(css).toContain('width: 800px');
      expect(css).toContain('height: 24px');
      expect(css).toContain('linear-gradient(to right');
      expect(css).toContain('pointer-events: none');
      expect(css).toContain('animation: flash-line-fade 500ms ease-out');
    });

    it('should include the color stop in gradient', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 100, height: 20 };
      const rgb = { r: 255, g: 0, b: 0 };
      const opacity = 0.5;
      const highlightPercent = 30;
      const duration = 500;

      const css = renderer.buildLeftGradientCSS(position, size, rgb, opacity, highlightPercent, duration);

      expect(css).toContain('rgba(255, 0, 0, 0.5)');
      expect(css).toContain('rgba(255, 0, 0, 0.25) 15%');
    });
  });

  describe('buildRightGradientCSS', () => {
    it('should build CSS for right-to-left gradient', () => {
      const position = { left: 100, top: 200 };
      const size = { width: 800, height: 24 };
      const rgb = { r: 100, g: 150, b: 255 };
      const opacity = 0.8;
      const highlightPercent = 50;
      const duration = 500;

      const css = renderer.buildRightGradientCSS(position, size, rgb, opacity, highlightPercent, duration);

      expect(css).toContain('position: fixed');
      expect(css).toContain('linear-gradient(to left');
      expect(css).toContain('pointer-events: none');
      expect(css).toContain('animation: flash-line-fade 500ms ease-out');
    });
  });

  describe('buildCenteredGradientCSS', () => {
    it('should build CSS for centered gradient with cursor position', () => {
      const position = { left: 0, top: 100 };
      const size = { width: 800, height: 24 };
      const rgb = { r: 100, g: 150, b: 255 };
      const opacity = 0.8;
      const cursorPercent = 50;
      const spreadPercent = 10;
      const duration = 500;

      const css = renderer.buildCenteredGradientCSS(position, size, rgb, opacity, cursorPercent, spreadPercent, duration);

      expect(css).toContain('position: fixed');
      expect(css).toContain('linear-gradient(to right');
      expect(css).toContain('pointer-events: none');
      expect(css).toContain('animation: flash-line-fade 500ms ease-out');
    });

    it('should position peak at cursor location', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 1000, height: 20 };
      const rgb = { r: 255, g: 100, b: 50 };
      const opacity = 0.9;
      const cursorPercent = 30;
      const spreadPercent = 5;
      const duration = 500;

      const css = renderer.buildCenteredGradientCSS(position, size, rgb, opacity, cursorPercent, spreadPercent, duration);

      // Peak should be at cursorPercent
      expect(css).toContain('30%');
    });

    it('should clamp edges to valid range', () => {
      const position = { left: 0, top: 0 };
      const size = { width: 100, height: 20 };
      const rgb = { r: 0, g: 0, b: 0 };
      const opacity = 1;
      const cursorPercent = 5;
      const spreadPercent = 20;
      const duration = 500;

      const css = renderer.buildCenteredGradientCSS(position, size, rgb, opacity, cursorPercent, spreadPercent, duration);

      // Left edge should be clamped to 0
      expect(css).toContain('transparent 0%');
      expect(css).toContain('transparent 25%');
    });
  });
});
