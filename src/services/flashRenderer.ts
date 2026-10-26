import { ownerWindow, setTimeoutIn } from "commons/windows";

/**
 * Service for rendering flash effects
 * Consolidates all three flash rendering modes (left, right, centered)
 * into a single reusable interface
 */
export class FlashRenderer {
  /**
   * Render a flash effect with the specified gradient mode
   *
   * @param mode - Gradient direction: 'left', 'right', or 'centered'
   * @param cssText - Complete CSS text for the flash element
   * @param duration - How long to display the flash in milliseconds
   * @param parentElement - Optional element to append flash to (defaults to document.body)
   */
  render(
    mode: 'left' | 'right' | 'centered',
    cssText: string,
    duration: number,
    parentElement?: HTMLElement
  ): void {
    const parent = parentElement || activeDocument.body;

    // Clean up any existing flash overlay elements to prevent overlapping animation blips
    if (parent && typeof parent.querySelectorAll === 'function') {
      const existing = parent.querySelectorAll('.obsidian-flash-line');
      existing.forEach((el) => el.remove());
    }

    const element = (parent.ownerDocument || activeDocument).createElement('div');
    element.className = 'obsidian-flash-line';
    element.style.cssText = cssText;

    parent.appendChild(element);

    let removed = false;
    const cleanup = () => {
      if (!removed) {
        removed = true;
        element.remove();
      }
    };

    if (typeof element.addEventListener === 'function') {
      element.addEventListener('animationend', cleanup, { once: true });
    }

    // Fallback cleanup timeout at animation duration
    const win = ownerWindow(parent) ?? activeWindow ?? window;
    setTimeoutIn(win, cleanup, duration);
  }

  /**
   * Build gradient CSS text for left-to-right flash
   * Gradient fades from solid color on the left to transparent on the right
   */
  buildLeftGradientCSS(
    position: { left: number; top: number },
    size: { width: number; height: number },
    rgb: { r: number; g: number; b: number },
    opacity: number,
    highlightPercent: number,
    duration: number,
    positionMode: 'fixed' | 'absolute' = 'fixed'
  ): string {
    const colorStop = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;

    return this.buildGradientCSS(
      position,
      size,
      `linear-gradient(to right,
        ${colorStop} 0%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.5}) ${highlightPercent * 0.5}%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) ${highlightPercent}%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%
      )`,
      duration,
      positionMode,
    );
  }

  /**
   * Build gradient CSS text for right-to-left flash
   * Gradient fades from solid color on the right to transparent on the left
   */
  buildRightGradientCSS(
    position: { left: number; top: number },
    size: { width: number; height: number },
    rgb: { r: number; g: number; b: number },
    opacity: number,
    highlightPercent: number,
    duration: number,
    positionMode: 'fixed' | 'absolute' = 'fixed'
  ): string {
    const colorStop = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;

    return this.buildGradientCSS(
      position,
      size,
      `linear-gradient(to left,
        ${colorStop} 0%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.5}) ${highlightPercent * 0.5}%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) ${highlightPercent}%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%
      )`,
      duration,
      positionMode,
    );
  }

  /**
   * Build gradient CSS text for centered flash
   * Gradient peaks at the cursor position and fades in both directions
   */
  buildCenteredGradientCSS(
    position: { left: number; top: number },
    size: { width: number; height: number },
    rgb: { r: number; g: number; b: number },
    opacity: number,
    cursorPercent: number,
    spreadPercent: number,
    duration: number,
    positionMode: 'fixed' | 'absolute' = 'fixed'
  ): string {
    const peakOpacity = opacity;
    const fadeOpacity = opacity * 0.75;
    const leftEdge = Math.max(0, cursorPercent - spreadPercent);
    const rightEdge = Math.min(100, cursorPercent + spreadPercent);

    return this.buildGradientCSS(
      position,
      size,
      `linear-gradient(to right,
        transparent 0%,
        transparent ${leftEdge}%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fadeOpacity}) ${(leftEdge + cursorPercent) / 2}%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${peakOpacity}) ${cursorPercent}%,
        rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fadeOpacity}) ${(cursorPercent + rightEdge) / 2}%,
        transparent ${rightEdge}%,
        transparent 100%
      )`,
      duration,
      positionMode,
    );
  }

  private buildGradientCSS(
    position: { left: number; top: number },
    size: { width: number; height: number },
    gradient: string,
    duration: number,
    positionMode: 'fixed' | 'absolute',
  ): string {
    return `
      position: ${positionMode};
      left: ${position.left}px;
      top: ${position.top}px;
      width: ${size.width}px;
      height: ${size.height}px;
      background: ${gradient};
      pointer-events: none;
      z-index: 1;
      animation: flash-line-fade ${duration}ms ease-out forwards;
    `;
  }
}
