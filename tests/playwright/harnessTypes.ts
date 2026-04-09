export type HarnessRect = {
	top: number;
	left: number;
	width: number;
	height: number;
};

export type VisibleCursorHarness = {
	setDoc: (doc: string, cursorPos?: number) => void;
	setCursor: (pos: number) => void;
	getDoc: () => string;
	getCursor: () => { head: number; assoc: number };
	pressKey: (key: string) => Promise<void>;
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
