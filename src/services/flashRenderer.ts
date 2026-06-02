/**
 * Service for rendering flash effects
 * Consolidates all three flash rendering modes (left, right, centered)
 * into a single reusable interface
 */
export class FlashRenderer {
  /**
   * Render a flash effect with the specified gradient mode
   * Eliminates code duplication between showLineFlash, showLineFlashRightToLeft, and showCursorCenteredFlash
   *
   * @param mode - Gradient direction: 'left', 'right', or 'centered'
   * @param cssText - Complete CSS text for the flash element
   * @param duration - How long to display the flash in milliseconds
   */
  render(mode: 'left' | 'right' | 'centered', cssText: string, duration: number): void {
    const element = document.createElement('div');
    element.className = 'obsidian-flash-line';
    element.style.cssText = cssText;

    document.body.appendChild(element);
    window.setTimeout(() => {
      element.remove();
    }, duration);
  }

  /**
   * Build gradient CSS text for left-to-right flash
   * Gradient fades from solid color on the left to transparent on the right
   */
  buildLeftGradientCSS(
    position: { left: number; top: number },
    size: { width: number; height: number },
    gradient: { colorStop: string; fadePercent: number; opacity: number }
  ): string {
    const { colorStop, fadePercent, opacity } = gradient;

    return `
      position: fixed;
      left: ${position.left}px;
      top: ${position.top}px;
      width: ${size.width}px;
      height: ${size.height}px;
      background: linear-gradient(to right,
        ${colorStop},
        ${colorStop.replace(colorStop.split(',')[3].trim(), `${opacity * 0.5})`)} ${fadePercent * 0.5}%,
        transparent ${fadePercent}%
      );
      pointer-events: none;
      z-index: 1;
    `;
  }

  /**
   * Build gradient CSS text for right-to-left flash
   * Gradient fades from solid color on the right to transparent on the left
   */
  buildRightGradientCSS(
    position: { left: number; top: number },
    size: { width: number; height: number },
    gradient: { colorStop: string; fadePercent: number; opacity: number }
  ): string {
    const { colorStop, fadePercent, opacity } = gradient;

    return `
      position: fixed;
      left: ${position.left}px;
      top: ${position.top}px;
      width: ${size.width}px;
      height: ${size.height}px;
      background: linear-gradient(to left,
        ${colorStop},
        ${colorStop.replace(colorStop.split(',')[3].trim(), `${opacity * 0.5})`)} ${fadePercent * 0.5}%,
        transparent ${fadePercent}%
      );
      pointer-events: none;
      z-index: 1;
    `;
  }

  /**
   * Build gradient CSS text for centered flash
   * Gradient peaks at the cursor position and fades in both directions
   */
  buildCenteredGradientCSS(
    position: { left: number; top: number },
    size: { width: number; height: number },
    gradient: {
      colorStop: string;
      cursorPercent: number;
      spreadPercent: number;
      peakOpacity: number;
      fadeOpacity: number;
    }
  ): string {
    const { colorStop, cursorPercent, spreadPercent, peakOpacity, fadeOpacity } = gradient;

    const leftEdge = Math.max(0, cursorPercent - spreadPercent);
    const rightEdge = Math.min(100, cursorPercent + spreadPercent);

    return `
      position: fixed;
      left: ${position.left}px;
      top: ${position.top}px;
      width: ${size.width}px;
      height: ${size.height}px;
      background: linear-gradient(to right,
        transparent 0%,
        transparent ${leftEdge}%,
        ${colorStop.replace(colorStop.split(',')[3].trim(), `${fadeOpacity})`)} ${(leftEdge + cursorPercent) / 2}%,
        ${colorStop.replace(colorStop.split(',')[3].trim(), `${peakOpacity})`)} ${cursorPercent}%,
        ${colorStop.replace(colorStop.split(',')[3].trim(), `${fadeOpacity})`)} ${(cursorPercent + rightEdge) / 2}%,
        transparent ${rightEdge}%,
        transparent 100%
      );
      pointer-events: none;
      z-index: 1;
    `;
  }
}
