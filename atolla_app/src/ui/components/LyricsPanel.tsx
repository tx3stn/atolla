import { activeLineIndex, type Lyrics } from 'atolla_core/src/models/Lyrics';
import Strings from 'atolla_core/src/Strings';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ElementFrame } from 'valdi_tsx/src/Geometry';
import type { ScrollEvent } from 'valdi_tsx/src/GestureEvents';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Palette } from '../../models/Color';
import { paletteDefaults, theme } from '../../theme';
import { LoadingView } from './LoadingView';

export const LyricsStatuses = {
	failed: 'failed',
	loaded: 'loaded',
	loading: 'loading',
} as const;

export type LyricsStatus = (typeof LyricsStatuses)[keyof typeof LyricsStatuses];

// where the active line sits in the viewport: just above the middle, so the lines coming up have
// more room than the ones already sung
const ACTIVE_LINE_ANCHOR = 0.4;

// how much playback has to elapse after a user scroll before the panel takes the scroll back
const FOLLOW_RESUME_SECONDS = 5;

export interface LyricsPanelViewModel {
	accessibilityId: string;
	bottomPadding: number;
	horizontalPadding: number;
	lyrics: Lyrics | null;
	onScrollOffset?: (y: number) => void;
	palette?: Palette;
	// when set and the lyrics are synced, the current line is highlighted and followed. the modal
	// omits it: it can be opened on any track, so a "current line" there would track unrelated audio
	playbackStore?: PlaybackStore;
	status: LyricsStatus;
	topPadding: number;
}

interface LyricsPanelState {
	activeIndex: number;
}

export class LyricsPanel extends StatefulComponent<LyricsPanelViewModel, LyricsPanelState> {
	state: LyricsPanelState = { activeIndex: -1 };

	private scrollRef = new ElementRef();
	private lineTops: Array<number> = [];
	private lineLayoutCallbacks: Array<(frame: ElementFrame) => void> = [];
	private viewportHeight = 0;
	private followSuspendedUntilSeconds = 0;
	private unsubscribeProgress?: () => void;

	onViewModelUpdate(prevViewModel: LyricsPanelViewModel): void {
		if (!prevViewModel) {
			this.unsubscribeProgress = this.viewModel.playbackStore?.subscribe(() => {
				this.syncToProgress();
			});
			return;
		}

		if (this.viewModel.lyrics !== prevViewModel.lyrics) {
			this.lineTops = [];
			this.lineLayoutCallbacks = [];
			this.followSuspendedUntilSeconds = 0;
			this.setState({ activeIndex: -1 });
			this.syncToProgress();
		}
	}

	onDestroy(): void {
		this.unsubscribeProgress?.();
	}

	onRender(): void {
		const { accessibilityId, lyrics, palette, status } = this.viewModel;

		if (status === LyricsStatuses.loading) {
			<LoadingView />;
			return;
		}

		if (status === LyricsStatuses.failed) {
			this.renderMessage(`${accessibilityId}-failed`, Strings.lyricsFailed(), palette);
			return;
		}

		if (!lyrics || lyrics.lines.length === 0) {
			this.renderMessage(`${accessibilityId}-empty`, Strings.lyricsEmpty(), palette);
			return;
		}

		const lineStyle = createLineStyle(
			theme.text.main,
			palette?.muted_on_surface.hex ?? paletteDefaults.mutedOnSurface,
		);
		const activeLineStyle = createLineStyle(
			theme.text.mainLarge,
			palette?.accent.hex ?? paletteDefaults.accent,
		);

		const scrollStyle = new Style<ScrollView>({
			...scrollBase,
			paddingBottom: this.viewModel.bottomPadding,
			paddingLeft: this.viewModel.horizontalPadding,
			paddingRight: this.viewModel.horizontalPadding,
			paddingTop: this.viewModel.topPadding,
		});

		<scroll
			accessibilityId={accessibilityId}
			bouncesFromDragAtStart={false}
			onDragStart={this.handleDragStart}
			onLayout={this.handleScrollLayout}
			onScroll={this.handleScroll}
			ref={this.scrollRef}
			style={scrollStyle}
		>
			{lyrics.lines.map((line, index) =>
				line.text === '' ? (
					<view
						key={`blank-${index}`}
						onLayout={this.lineLayoutCallback(index)}
						style={styles.blankLine}
					/>
				) : (
					<label
						accessibilityId={`${accessibilityId}-line-${index}`}
						accessibilityLabel={`${accessibilityId}-line-${index}`}
						key={`line-${index}`}
						numberOfLines={0}
						onLayout={this.lineLayoutCallback(index)}
						style={index === this.state.activeIndex ? activeLineStyle : lineStyle}
						value={line.text}
					/>
				),
			)}
		</scroll>;
	}

	private handleDragStart = (): void => {
		const progressSeconds = this.viewModel.playbackStore?.progressSeconds ?? 0;
		this.followSuspendedUntilSeconds = progressSeconds + FOLLOW_RESUME_SECONDS;
	};

	private handleScroll = (event: ScrollEvent): void => {
		this.viewModel.onScrollOffset?.(event.y);
	};

	private handleScrollLayout = (frame: ElementFrame): void => {
		this.viewportHeight = frame.height;
	};

	// stable per index, so a re-render doesn't hand every line a fresh callback identity
	private lineLayoutCallback(index: number): (frame: ElementFrame) => void {
		const existing = this.lineLayoutCallbacks[index];
		if (existing) {
			return existing;
		}

		const callback = (frame: ElementFrame): void => {
			if (this.lineTops[index] === frame.y) {
				return;
			}
			this.lineTops[index] = frame.y;

			// the active line is larger, so activating it re-flows the column and the line the
			// scroll was just aimed at has moved. re-aim once its real position lands
			if (index === this.state.activeIndex) {
				this.scrollToActiveLine(index, this.viewModel.playbackStore?.progressSeconds ?? 0);
			}
		};
		this.lineLayoutCallbacks[index] = callback;
		return callback;
	}

	private renderMessage(accessibilityId: string, message: string, palette?: Palette): void {
		const messageStyle = new Style<Label>({
			...theme.text.sub,
			color: palette?.muted_on_surface.hex ?? paletteDefaults.mutedOnSurface,
			textAlign: 'center',
		});

		const containerStyle = new Style<View>({
			...messageContainerBase,
			paddingBottom: messageContainerBase.paddingBottom + this.viewModel.bottomPadding,
			paddingLeft: this.viewModel.horizontalPadding,
			paddingRight: this.viewModel.horizontalPadding,
			paddingTop: messageContainerBase.paddingTop + this.viewModel.topPadding,
		});

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			style={containerStyle}
		>
			<label numberOfLines={0} style={messageStyle} value={message} />
		</view>;
	}

	private scrollToActiveLine(index: number, progressSeconds: number): void {
		if (index < 0 || progressSeconds < this.followSuspendedUntilSeconds) {
			return;
		}

		const lineTop = this.lineTops[index];
		if (lineTop === undefined || this.viewportHeight <= 0) {
			return;
		}

		this.scrollRef.setAttribute('contentOffsetAnimated', true);
		this.scrollRef.setAttribute(
			'contentOffsetY',
			Math.max(0, lineTop - this.viewportHeight * ACTIVE_LINE_ANCHOR),
		);
	}

	// runs on every progress notify (~5Hz), so it must stay cheap and only re-render when the line
	// actually turns over. a seek notifies too, so the highlight tracks it without a special case
	private syncToProgress(): void {
		const { lyrics, playbackStore } = this.viewModel;
		if (!playbackStore || !lyrics?.synced) {
			return;
		}

		const progressSeconds = playbackStore.progressSeconds;
		const index = activeLineIndex(lyrics.lines, progressSeconds);
		if (index === this.state.activeIndex) {
			return;
		}

		this.setState({ activeIndex: index });
		this.scrollToActiveLine(index, progressSeconds);
	}
}

function createLineStyle(text: typeof theme.text.main, color: string): Style<Label> {
	return new Style<Label>({
		...text,
		color,
		marginBottom: theme.scale(10),
	});
}

const scrollBase = {
	flexGrow: 1,
	width: '100%' as const,
};

const messageContainerBase = {
	alignItems: 'center' as const,
	flexGrow: 1,
	justifyContent: 'center' as const,
	paddingBottom: theme.scale(24),
	paddingTop: theme.scale(24),
	width: '100%' as const,
};

const styles = {
	blankLine: new Style<View>({
		height: theme.scale(12),
		width: '100%',
	}),
};
