import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';

export type SlotRenderer = () => void;

export const EMPTY_SLOT_RENDERER: SlotRenderer = (): void => {};

export function openSlot(slot: DetachedSlot | undefined, render: SlotRenderer): void {
	slot?.slotted(render);
}

export function closeSlot(slot: DetachedSlot | undefined): void {
	slot?.slotted(EMPTY_SLOT_RENDERER);
}
