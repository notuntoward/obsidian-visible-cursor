// Mock document globals for tests
// Store classes in a Set for dynamic classList behavior
const bodyClasses = new Set<string>();

if (typeof global !== 'undefined' && !global.document) {
	(global as any).document = {
		documentElement: {
			style: {}
		},
		body: {
			style: {},
			classList: {
				contains: (className: string) => bodyClasses.has(className),
				add: (className: string) => bodyClasses.add(className),
				remove: (className: string) => bodyClasses.delete(className)
			},
			appendChild: () => {},
			removeChild: () => {}
		},
		head: {
			appendChild: () => {},
			removeChild: () => {}
		},
		createElement: (tag: string) => {
			const classes = new Set<string>();
			const el: any = {
				tagName: tag.toUpperCase(),
				textContent: '',
				style: {
					cssText: '',
					setProperty: () => {}
				},
				setAttribute: () => {},
				getAttribute: () => null,
				remove: () => {},
				className: '',
				classList: {
					contains: (cls: string) => classes.has(cls),
					add: (cls: string) => { classes.add(cls); el.className = Array.from(classes).join(' '); },
					remove: (cls: string) => { classes.delete(cls); el.className = Array.from(classes).join(' '); }
				},
				close: () => {},
				open: () => {},
				write: () => {},
				appendChild: (child: any) => {
					if (child) child.parentElement = el;
				},
				removeChild: (child: any) => {
					if (child) child.parentElement = null;
				}
			};
			return el;
		},
		getElementById: () => null,
		getComputedStyle: () => ({
			getPropertyValue: () => '#6496ff',
			fontSize: '16px'
		})
	};
}

// Mock window global
if (typeof global !== 'undefined' && !global.window) {
	(global as any).window = {
		addEventListener: () => {},
		removeEventListener: () => {},
		setTimeout: (callback: (...args: any[]) => void, ms: number, ...args: any[]) => setTimeout(callback, ms, ...args),
		clearTimeout: (id: any) => clearTimeout(id),
		requestAnimationFrame: (callback: (time: number) => void) => {
			setTimeout(() => callback(performance.now()), 0);
		},
		cancelAnimationFrame: (id: any) => clearTimeout(id)
	};
}

if (typeof global !== 'undefined' && !(global as any).navigator) {
	(global as any).navigator = {
		userAgent: 'vitest',
		vendor: 'vitest',
		platform: 'Win32',
		maxTouchPoints: 0
	};
}

// Ensure performance object exists
if (typeof global !== 'undefined' && !global.performance) {
	(global as any).performance = {
		now: () => Date.now()
	};
}

// Ensure getComputedStyle exists
if (typeof global !== 'undefined' && !(global as any).getComputedStyle) {
	const mockComputedStyle = () => ({
		getPropertyValue: () => '#6496ff',
		fontSize: '16px',
		fontStyle: 'normal',
		fontWeight: 'normal',
		fontFamily: 'inherit',
		color: '#000000'
	});
	(global as any).getComputedStyle = mockComputedStyle;
	if ((global as any).window) {
		(global as any).window.getComputedStyle = mockComputedStyle;
	}
}

export {};
