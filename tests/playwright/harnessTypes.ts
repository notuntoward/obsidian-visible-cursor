export type HarnessRect = {
	top: number;
	left: number;
	width: number;
	height: number;
};
export type VisibleCursorHarness = {
	setDoc: (doc: string, cursorPos?: number) => void;
	setCursor: (pos: number) => void;
	setCursorWithAssoc: (pos: number, assoc: number) => void;
	setBlockWrapState: (pos: number, assoc: number) => void;
	setSelection: (anchor: number, head: number) => void;
	getDoc: () => string;
	getCursor: () => { head: number; assoc: number };
	getView: () => unknown;
	dispatchEmacsMoveToStart: (targetPos: number) => void;
	pressKey: (key: string) => Promise<void>;
	getCustomCursorText: () => string | null;
	getCustomCursorRect: () => HarnessRect | null;
	getNativeCursorRect: () => HarnessRect | null;
	getLineText: (lineNumber: number) => string | null;
	getSelectionTextAround: (pos: number, span?: number) => string;
	getDefaultCharWidth: () => number;
	destroy: () => void;
};

declare global {
	interface Window {
		__visibleCursorHarness?: VisibleCursorHarness;
	}
}

export {};
