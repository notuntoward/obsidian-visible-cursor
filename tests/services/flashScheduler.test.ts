import { describe, it, expect, beforeEach } from 'vitest';
import { FlashScheduler, FlashState } from '../../src/services/flashScheduler';

describe('FlashScheduler Service', () => {
  let scheduler: FlashScheduler;

  beforeEach(() => {
    scheduler = new FlashScheduler();
  });

  describe('canScheduleFlash', () => {
    it('should allow flash in clean state', () => {
      const state: FlashState = {
        isFenceActive: false,
        isFlashActive: false,
        hasPendingFlash: false,
        lastViewChange: 0,
        now: Date.now(),
      };

      expect(scheduler.canScheduleFlash('scroll', state)).toBe(true);
    });

    it('should block flash when fence is active for scroll trigger', () => {
      const state: FlashState = {
        isFenceActive: true,
        isFlashActive: false,
        hasPendingFlash: false,
        lastViewChange: Date.now(),
        now: Date.now(),
      };

      expect(scheduler.canScheduleFlash('scroll', state)).toBe(false);
    });

    it('should block view-change when click fence is active', () => {
      const state: FlashState = {
        isFenceActive: true,
        isFlashActive: false,
        hasPendingFlash: false,
        lastViewChange: Date.now(),
        now: Date.now(),
      };

      expect(scheduler.canScheduleFlash('view-change', state)).toBe(false);
    });

    it('should block flash when already active', () => {
      const state: FlashState = {
        isFenceActive: false,
        isFlashActive: true,
        hasPendingFlash: false,
        lastViewChange: Date.now(),
        now: Date.now(),
      };

      expect(scheduler.canScheduleFlash('scroll', state)).toBe(false);
    });

    it('should block flash when pending', () => {
      const state: FlashState = {
        isFenceActive: false,
        isFlashActive: false,
        hasPendingFlash: true,
        lastViewChange: Date.now(),
        now: Date.now(),
      };

      expect(scheduler.canScheduleFlash('scroll', state)).toBe(false);
    });

    it('should respect minimum time between flashes', () => {
      const now = Date.now();
      const state: FlashState = {
        isFenceActive: false,
        isFlashActive: false,
        hasPendingFlash: false,
        lastViewChange: now - 50, // Only 50ms ago
        now: now,
      };

      expect(scheduler.canScheduleFlash('scroll', state)).toBe(false);
    });

    it('should allow flash after minimum time has passed', () => {
      const now = Date.now();
      const state: FlashState = {
        isFenceActive: false,
        isFlashActive: false,
        hasPendingFlash: false,
        lastViewChange: now - 150, // 150ms ago (enough)
        now: now,
      };

      expect(scheduler.canScheduleFlash('scroll', state)).toBe(true);
    });
  });

  describe('getScrollDebounceTime', () => {
    it('should return 250ms for small scroll delta', () => {
      expect(scheduler.getScrollDebounceTime(3)).toBe(250);
    });

    it('should return 150ms for large scroll delta', () => {
      expect(scheduler.getScrollDebounceTime(50)).toBe(150);
    });

    it('should return 150ms at threshold', () => {
      expect(scheduler.getScrollDebounceTime(5)).toBe(150);
    });
  });

  describe('scheduleCallback', () => {
    it('should return a valid timeout ID', () => {
      const callback = () => {};
      const timeoutId = scheduler.scheduleCallback(callback, 100);
      expect(typeof timeoutId).toBe('object');
      clearTimeout(timeoutId);
    });
  });

  describe('scheduleReset', () => {
    it('should return a valid timeout ID', () => {
      const callback = () => {};
      const timeoutId = scheduler.scheduleReset(callback, 500);
      expect(typeof timeoutId).toBe('object');
      clearTimeout(timeoutId);
    });
  });
});
