import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hexToRgb } from '../src/utils';
import { FlashScheduler } from '../src/services/flashScheduler';
import { getPreciseCursorCoords } from '../main';
import VisibleCursorPlugin from '../main';
import * as workspaceCommons from 'commons/workspace';
import * as windowsCommons from 'commons/windows';

describe('commons adoption: color parser enhancements', () => {
  it('converts 3-digit hex colors to RGB', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('0f0')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('converts 4-digit hex colors to RGB', () => {
    expect(hexToRgb('#f00a')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('converts percentage rgb strings to RGB', () => {
    expect(hexToRgb('rgb(100%, 50%, 0%)')).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('converts decimal rgb strings to RGB', () => {
    expect(hexToRgb('rgb(100.2, 200.8, 50)')).toEqual({ r: 100, g: 201, b: 50 });
  });
});

describe('commons adoption: FlashScheduler owner-window timers', () => {
  let scheduler: FlashScheduler;

  beforeEach(() => {
    scheduler = new FlashScheduler();
  });

  it('scheduleCallback uses the provided owner window', () => {
    const mockWin = {
      setTimeout: vi.fn().mockReturnValue(12345),
      clearTimeout: vi.fn(),
    } as unknown as Window;

    const cb = vi.fn();
    const id = (scheduler as any).scheduleCallback(cb, 50, mockWin);
    expect(mockWin.setTimeout).toHaveBeenCalledWith(cb, 50);
    expect(id).toBe(12345);
  });

  it('scheduleReset uses the provided owner window', () => {
    const mockWin = {
      setTimeout: vi.fn().mockReturnValue(67890),
      clearTimeout: vi.fn(),
    } as unknown as Window;

    const cb = vi.fn();
    const id = (scheduler as any).scheduleReset(cb, 300, mockWin);
    expect(mockWin.setTimeout).toHaveBeenCalledWith(cb, 300);
    expect(id).toBe(67890);
  });
});

describe('commons adoption: popout window selection in cursorCoords', () => {
  it('derives getSelection from ownerWindow/ownerDocument instead of bare window', () => {
    const popoutWin = {
      getSelection: vi.fn().mockReturnValue({
        rangeCount: 1,
        getRangeAt: () => ({
          commonAncestorContainer: {},
          getBoundingClientRect: () => ({ top: 10, bottom: 30, left: 20, right: 30, width: 10, height: 20 }),
        }),
      }),
    } as unknown as Window;

    const scrollDOM: any = {
      contains: vi.fn().mockReturnValue(true),
    };

    const contentDOM: any = {
      ownerDocument: {
        defaultView: popoutWin,
        getSelection: popoutWin.getSelection,
      },
    };

    const mockView: any = {
      defaultLineHeight: 20,
      state: {
        selection: { main: { empty: true, head: 5, assoc: 1 } },
        doc: { length: 100, lineAt: () => ({ from: 0, to: 50, text: 'hello' }) },
      },
      dom: contentDOM,
      scrollDOM: scrollDOM,
      coordsAtPos: vi.fn(),
    };

    const coords = getPreciseCursorCoords(mockView, 5);
    expect(popoutWin.getSelection).toHaveBeenCalled();
    expect(coords).not.toBeNull();
    expect(coords?.top).toBe(10);
    expect(coords?.left).toBe(20);
  });
});

describe('commons adoption: workspace and window delegation', () => {
  it('getActiveLeafInFocusedWindow delegates to commons/workspace getActiveLeafInFocusedWindow', () => {
    const mockLeaf = { id: 'leaf-1' } as any;
    const spy = vi.spyOn(workspaceCommons, 'getActiveLeafInFocusedWindow').mockReturnValue(mockLeaf);

    const mockApp = { workspace: {} } as any;
    const plugin = new VisibleCursorPlugin(mockApp, {} as any);

    const result = (plugin as any).getActiveLeafInFocusedWindow();
    expect(spy).toHaveBeenCalledWith(mockApp);
    expect(result).toBe(mockLeaf);
    spy.mockRestore();
  });

  it('onload sets up click fence on every window using forEachWindow', async () => {
    const forEachWindowSpy = vi.spyOn(windowsCommons, 'forEachWindow');

    const mockApp = {
      workspace: {
        on: vi.fn().mockReturnValue({}),
        onLayoutReady: vi.fn(),
        updateOptions: vi.fn(),
      },
    } as any;
    const plugin = new VisibleCursorPlugin(mockApp, {} as any);
    plugin.loadSettings = vi.fn().mockResolvedValue(undefined);
    plugin.registerEditorExtension = vi.fn();
    plugin.registerEvent = vi.fn();
    plugin.addSettingTab = vi.fn();

    await plugin.onload();

    expect(forEachWindowSpy).toHaveBeenCalledWith(plugin, expect.any(Function));

    // Verify setup adds event listeners to the passed window
    const setupFn = forEachWindowSpy.mock.calls[0][1];
    const mockWin = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;

    const cleanup = setupFn(mockWin);
    expect(mockWin.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), { capture: true });
    expect(mockWin.addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function), { capture: true });
    expect(mockWin.addEventListener).toHaveBeenCalledWith('pointercancel', expect.any(Function), { capture: true });
    expect(mockWin.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), { capture: true });

    if (typeof cleanup === 'function') {
      cleanup();
      expect(mockWin.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), { capture: true });
      expect(mockWin.removeEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function), { capture: true });
      expect(mockWin.removeEventListener).toHaveBeenCalledWith('pointercancel', expect.any(Function), { capture: true });
      expect(mockWin.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function), { capture: true });
    }

    forEachWindowSpy.mockRestore();
  });
});
