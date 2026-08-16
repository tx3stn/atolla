import type { ElementRef } from 'valdi_core/src/ElementRef';
import { RenderedElementUtils } from 'valdi_core/src/utils/RenderedElementUtils';
import type { DragAutoScroller } from './TrackList';

// backs DragAutoScroller with a <scroll> ref: the owning view feeds live offset and content
// height so it can scroll within bounds while a row is dragged to a viewport edge
export class ScrollDragAutoScroller implements DragAutoScroller {
	private offset = 0;
	private contentHeight = 0;

	constructor(private readonly scrollRef: ElementRef) {}

	setOffset(offset: number): void {
		this.offset = offset;
	}

	setContentHeight(height: number): void {
		this.contentHeight = height;
	}

	setScrollEnabled(enabled: boolean): void {
		this.scrollRef.setAttribute('scrollEnabled', enabled);
	}

	viewport(): { bottom: number; top: number } | undefined {
		const element = this.scrollRef.all()[0];
		const height = element?.frame?.height;
		if (!element || !height) {
			return undefined;
		}
		const top = RenderedElementUtils.absolutePosition(element).y;
		return { bottom: top + height, top };
	}

	scrollBy(delta: number): number {
		const element = this.scrollRef.all()[0];
		if (!element) {
			return 0;
		}
		const viewportHeight = element.frame?.height ?? 0;
		const maxOffset = Math.max(0, this.contentHeight - viewportHeight);
		const next = Math.max(0, Math.min(maxOffset, this.offset + delta));
		const applied = next - this.offset;
		if (applied === 0) {
			return 0;
		}
		this.offset = next;
		this.scrollRef.setAttribute('contentOffsetY', next);
		return applied;
	}
}
