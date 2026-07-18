import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ContentSizeChangeEvent, ScrollEvent } from 'valdi_tsx/src/GestureEvents';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { hapticFeedback } from '../../utils/Haptics';
import { LoopingArrowSpinner } from './LoopingArrowSpinner';
import { SpinnerController } from './SpinnerController';

// how far past the top the user must overscroll before releasing triggers a refresh
const PULL_TRIGGER = 35;
const MIN_SPIN_MS = 750;

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

interface RefreshableScrollState {
	spinning: boolean;
}

export class RefreshableScroll extends StatefulComponent<
	RefreshableScrollViewModel,
	RefreshableScrollState
> {
	state: RefreshableScrollState = { spinning: false };
	private readonly overlayRef = new ElementRef<View>();
	private readonly spinnerController = new SpinnerController();
	private maxPull = 0;
	private armed = false;
	private spinTimer?: ReturnType<typeof setTimeout>;

	onDestroy(): void {
		this.clearSpinTimer();
	}

	onViewModelUpdate(previousViewModel?: RefreshableScrollViewModel): void {
		const wasRefreshing = previousViewModel?.isRefreshing ?? false;
		if (!wasRefreshing && this.viewModel.isRefreshing) {
			this.setOverlayOpacity(1);
		} else if (wasRefreshing && !this.viewModel.isRefreshing) {
			this.hideIfIdle();
		}
	}

	onRender(): void {
		const showing = this.isShowing();
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
				style={showing ? styles.overlayVisible : styles.overlayHidden}
			>
				<view style={styles.spinnerPill}>
					<LoopingArrowSpinner
						accessibilityId={this.spinnerAccessibilityId()}
						controller={this.spinnerController}
						size={22}
						spinning={showing}
					/>
				</view>
			</view>
		</view>;
	}

	private handleScroll = (event: ScrollEvent): void => {
		this.viewModel.onScroll?.(event.y);
		if (this.isShowing()) {
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
				this.spinnerController.start();
			}
			this.setOverlayOpacity(1);
		} else {
			this.setOverlayOpacity(this.maxPull / PULL_TRIGGER);
		}
	};

	private handleScrollEnd = (): void => {
		const shouldRefresh = this.armed && !this.isShowing();
		this.maxPull = 0;
		this.armed = false;
		if (shouldRefresh) {
			this.startSpin();
			this.viewModel.onRefresh();
		} else if (!this.isShowing()) {
			this.setOverlayOpacity(0);
		}
	};

	private startSpin(): void {
		this.clearSpinTimer();
		this.setOverlayOpacity(1);
		if (!this.state.spinning) {
			this.setState({ spinning: true });
		}
		this.spinTimer = setTimeout(() => {
			this.spinTimer = undefined;
			if (this.isDestroyed()) {
				return;
			}
			this.setState({ spinning: false });
			// keep it up if the caller's refresh is still running; onViewModelUpdate hides it later
			if (!this.viewModel.isRefreshing) {
				this.setOverlayOpacity(0);
			}
		}, MIN_SPIN_MS);
	}

	private hideIfIdle(): void {
		if (!this.state.spinning && !this.viewModel.isRefreshing) {
			this.setOverlayOpacity(0);
		}
	}

	private isShowing(): boolean {
		return this.state.spinning || this.viewModel.isRefreshing;
	}

	private clearSpinTimer(): void {
		if (this.spinTimer !== undefined) {
			clearTimeout(this.spinTimer);
			this.spinTimer = undefined;
		}
	}

	private resetPull(): void {
		this.maxPull = 0;
		this.armed = false;
		this.spinnerController.stop();
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
};
