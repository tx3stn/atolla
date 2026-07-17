import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ContentSizeChangeEvent, ScrollEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { hapticFeedback } from '../../utils/Haptics';
import { LoopingArrowSpinner } from './LoopingArrowSpinner';

// how far past the top the user must overscroll before releasing triggers a refresh — a small tug
const PULL_TRIGGER = 35;

export interface RefreshableScrollViewModel {
	accessibilityId?: string;
	isRefreshing: boolean;
	// forwarded straight to the inner scroll, for callers that drive a drag auto-scroller
	onContentSizeChange?: (event: ContentSizeChangeEvent) => void;
	onRefresh: () => void;
	// forwarded scroll offset, so callers can keep driving a collapsing header
	onScroll?: (y: number) => void;
	// attached to the inner scroll, for callers that need the scroll element (e.g. drag reorder)
	scrollRef?: ElementRef<ScrollView>;
	style?: Style<ScrollView>;
}

// Wraps a vertical <scroll> with pull-to-refresh. The spinner overlay fades in as the pull grows
// and stays lit while refreshing. Crucially it never re-renders mid-gesture — a setState during
// the drag disturbs the native overscroll/bounce (on iOS it leaves the pulled-open gap stuck) — so
// the pull fade is applied imperatively through a ref during onScroll, and the refresh only fires
// on onScrollEnd, once the scroll has settled. The refreshing state is declarative (isRefreshing,
// owned by the caller); that only flips between gestures, so re-rendering for it is safe.
export class RefreshableScroll extends Component<RefreshableScrollViewModel> {
	private readonly overlayRef = new ElementRef<View>();
	private maxPull = 0;
	private armed = false;

	// A ref-set opacity persists across re-renders and wins over the style, so the declarative
	// overlayHidden/overlayVisible alone can't clear a pull's fade. Reconcile the ref to match
	// whenever the refreshing state flips (which only happens between gestures, never mid-drag).
	onViewModelUpdate(previousViewModel?: RefreshableScrollViewModel): void {
		const wasRefreshing = previousViewModel?.isRefreshing ?? false;
		if (wasRefreshing !== this.viewModel.isRefreshing) {
			this.setOverlayOpacity(this.viewModel.isRefreshing ? 1 : 0);
		}
	}

	onRender(): void {
		<view style={styles.root}>
			<scroll
				onContentSizeChange={this.viewModel.onContentSizeChange}
				onScroll={this.handleScroll}
				onScrollEnd={this.handleScrollEnd}
				ref={this.viewModel.scrollRef}
				style={this.viewModel.style ?? styles.scroll}
			>
				<slot />
			</scroll>
			<view
				accessibilityId={this.overlayAccessibilityId()}
				accessibilityLabel={this.overlayAccessibilityId()}
				ref={this.overlayRef}
				style={this.viewModel.isRefreshing ? styles.overlayVisible : styles.overlayHidden}
			>
				<view style={styles.spinnerPill}>
					{this.viewModel.isRefreshing ? (
						// only mounted while refreshing so it never animates at rest — a perpetual
						// animation keeps Android's UiAutomator2 from ever reporting idle, hanging e2e
						<LoopingArrowSpinner accessibilityId={this.spinnerAccessibilityId()} size={22} />
					) : (
						<image src={res.loopingarrow} style={styles.staticArrow} tint={theme.colors.active} />
					)}
				</view>
			</view>
		</view>;
	}

	private handleScroll = (event: ScrollEvent): void => {
		this.viewModel.onScroll?.(event.y);
		if (this.viewModel.isRefreshing) {
			return;
		}
		if (event.y > 0) {
			// scrolled down into content: this is not a pull-to-refresh, so forget any tracked pull
			this.resetPull();
			return;
		}
		const pull = pullDistance(event.y, event.overscrollTensionY);
		if (pull > this.maxPull) {
			this.maxPull = pull;
		}
		if (this.maxPull >= PULL_TRIGGER) {
			if (!this.armed) {
				this.armed = true;
				hapticFeedback();
			}
			this.setOverlayOpacity(1);
		} else {
			this.setOverlayOpacity(this.maxPull / PULL_TRIGGER);
		}
	};

	private handleScrollEnd = (): void => {
		const shouldRefresh = this.armed && !this.viewModel.isRefreshing;
		this.maxPull = 0;
		this.armed = false;
		if (shouldRefresh) {
			// the caller flips isRefreshing on, which re-renders the overlay lit; leave the ref as-is
			this.viewModel.onRefresh();
		} else if (!this.viewModel.isRefreshing) {
			this.setOverlayOpacity(0);
		}
	};

	private resetPull(): void {
		this.maxPull = 0;
		this.armed = false;
		this.setOverlayOpacity(0);
	}

	private setOverlayOpacity(value: number): void {
		this.overlayRef.setAttribute('opacity', value);
	}

	private overlayAccessibilityId(): string {
		return `${this.viewModel.accessibilityId ?? 'refreshable-scroll'}-refresh`;
	}

	private spinnerAccessibilityId(): string {
		return `${this.viewModel.accessibilityId ?? 'refreshable-scroll'}-refresh-spinner`;
	}
}

// iOS reports the pull as a negative content offset (bounce); Android reports overscroll tension
function pullDistance(y: number, overscrollTensionY: number | undefined): number {
	return Math.max(0, -y) + Math.max(0, -(overscrollTensionY ?? 0));
}

const overlayLayout = {
	alignItems: 'center' as const,
	left: 0,
	position: 'absolute' as const,
	right: 0,
	top: theme.padding.scrollHeader(null),
};

const styles = {
	overlayHidden: new Style<View>({ ...overlayLayout, opacity: 0 }),
	overlayVisible: new Style<View>({ ...overlayLayout, opacity: 1 }),
	root: new Style<View>({
		flexGrow: 1,
		position: 'relative',
		width: '100%',
	}),
	scroll: new Style<ScrollView>({
		flexGrow: 1,
		width: '100%',
	}),
	spinnerPill: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgFrosted,
		borderRadius: theme.radius.pill,
		height: 40,
		justifyContent: 'center',
		width: 40,
	}),
	staticArrow: new Style<ImageView>({
		height: 22,
		width: 22,
	}),
};
