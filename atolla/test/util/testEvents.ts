import type { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import type { ElementFrame } from 'valdi_tsx/src/Geometry';
import type { DragEvent, TouchEvent } from 'valdi_tsx/src/GestureEvents';

// Synthetic events / attribute readers for driving rendered elements in tests.
// Valdi 0.1.0 made the rendered handler signatures and style attributes strongly
// typed. The components under test only read a few fields, so we synthesise
// minimal values (and cast past the unused required fields).

// onTap and friends: a complete-gesture event; the handlers don't read its fields.
export const touchEvent = { x: 0, y: 0 } as TouchEvent;

export const layoutFrame: ElementFrame = { height: 0, width: 0, x: 0, y: 0 };

export function editTextEvent(text: string): {
	text: string;
	selectionStart: number;
	selectionEnd: number;
} {
	return { selectionEnd: text.length, selectionStart: text.length, text };
}

// onTouch / onLongPress: pass the touch fields the component reads (state, absoluteY, …).
export function touchEventWith(overrides: Record<string, unknown>): TouchEvent {
	return { x: 0, y: 0, ...overrides } as TouchEvent;
}

// onDrag: pass the drag fields the component reads (state, deltaY, velocityY, …).
export function dragEvent(overrides: Record<string, unknown>): DragEvent {
	return { x: 0, y: 0, ...overrides } as DragEvent;
}

// Reads a computed style attribute. Valdi 0.1.0 types style.attributes as the
// element's (View | Layout) props, so colour/opacity aren't reachable on the
// union without narrowing — tests only assert their values.
export function styleAttribute(element: IRenderedElement | undefined, name: string): unknown {
	const attributes = element?.getAttribute('style')?.attributes as unknown as
		| Record<string, unknown>
		| undefined;
	return attributes?.[name];
}
