// Mock document globals for tests
// Store classes in a Set for dynamic classList behavior
const bodyClasses = new Set<string>();

if (typeof global !== 'undefined' && !global.document) {
	(global as any).document = {
		body: {
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
		createElement: (tag: string) => ({
			tagName: tag.toUpperCase(),
			textContent: '',
			style: {
				cssText: ''
			},
			setAttribute: () => {},
			getAttribute: () => null,
			remove: () => {},
			className: '',
			close: () => {},
			open: () => {},
			write: () => {},
			appendChild: () => {},
			removeChild: () => {}
		}),
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
		requestAnimationFrame: (callback: (time: number) => void) => {
			setTimeout(() => callback(performance.now()), 0);
		}
	};
}

// Ensure performance object exists
if (typeof global !== 'undefined' && !global.performance) {
	(global as any).performance = {
		now: () => Date.now()
	};
}

export {};
