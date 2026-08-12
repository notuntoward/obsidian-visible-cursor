export type HarnessRect = {
	top: number;
	left: number;
	width: number;
	height: number;
};

export type MoveToEndResult = {
	head: number;
	assoc: number;
};

export type DeleteForwardResult = {
	deletedChar: string;
	headBefore: number;
};

export type SoftWrapBoundary = {
	pos: number;
	upperTop: number;
	lowerTop: number;
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
	dispatchEmacsMoveToEndFrom: (fromPos: number) => MoveToEndResult;
	deleteForwardAtCursor: () => DeleteForwardResult;
	measure: () => void;
	findFirstSoftWrap: () => SoftWrapBoundary | null;
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
