import { shouldAllowFlash, calculateScrollDebounceTime } from '../utils';

/**
 * State object for flash scheduling
 * Makes all timing and gating dependencies explicit
 */
export interface FlashState {
  isFenceActive: boolean;
  isFlashActive: boolean;
  hasPendingFlash: boolean;
  lastViewChange: number;
  now: number;
}

/**
 * Service for managing flash scheduling and debouncing
 * Encapsulates all flash timing and gating logic
 * Determines when flashes should be shown based on user actions and plugin state
 */
export class FlashScheduler {
  /**
   * Determine if a flash can be scheduled given the current state and trigger
   * Takes into account click fencing, active flashes, pending flashes, and timing
   *
   * @param trigger - The trigger type: 'scroll', 'view-change', 'layout-change'
   * @param state - Current flash state
   * @returns true if flash should be scheduled, false if it should be blocked
   */
  canScheduleFlash(trigger: string, state: FlashState): boolean {
    // Check if flash is allowed based on trigger type and state
    const flashAllowed = shouldAllowFlash(
      trigger,
      state.isFenceActive,
      state.isFlashActive,
      state.hasPendingFlash
    );

    if (!flashAllowed) {
      return false;
    }

    // For non-view-triggers, ensure minimum time between flashes
    // This prevents rapid successive flashes from slowing down the UI
    const isViewTrigger = trigger === 'view-change' || trigger === 'layout-change';
    if (!isViewTrigger && state.now - state.lastViewChange < 100) {
      return false;
    }

    return true;
  }

  /**
   * Calculate debounce time based on scroll movement
   * Small movements wait longer (careful scrolling = deliberate, show flash soon)
   * Large movements wait less (momentum/flick scroll = accidental, debounce it)
   *
   * @param scrollDelta - Pixels scrolled
   * @returns Milliseconds to debounce
   */
  getScrollDebounceTime(scrollDelta: number): number {
    return calculateScrollDebounceTime(scrollDelta);
  }

  /**
   * Create a timeout for flash scheduling
   * Centralized so that flash timing can be easily adjusted or faked in tests
   *
   * @param callback - Function to call
   * @param delayMs - Milliseconds to wait
   * @returns Timeout ID for cancellation
   */
  scheduleCallback(callback: () => void, delayMs: number): number {
    return window.setTimeout(callback, delayMs);
  }

  /**
   * Create a timeout for flash reset
   * Keeps flash visible for the specified duration, then hides it
   *
   * @param callback - Function to call when timer fires
   * @param delayMs - Milliseconds to keep flash visible
   * @returns Timeout ID for cancellation
   */
  scheduleReset(callback: () => void, delayMs: number): number {
    return window.setTimeout(callback, delayMs);
  }
}
