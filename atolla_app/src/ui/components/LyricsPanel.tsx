import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import Strings from 'atolla_core/src/Strings';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
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

export interface LyricsPanelViewModel {
	accessibilityId: string;
	lyrics: Lyrics | null;
	palette?: Palette;
	status: LyricsStatus;
}

export class LyricsPanel extends Component<LyricsPanelViewModel> {
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

		const lineStyle = new Style<Label>({
			...theme.text.main,
			color: palette?.muted_on_surface.hex ?? paletteDefaults.mutedOnSurface,
			marginBottom: theme.scale(10),
		});

		<scroll accessibilityId={accessibilityId} style={styles.scroll}>
			{lyrics.lines.map((line, index) =>
				line.text === '' ? (
					<view key={`blank-${index}`} style={styles.blankLine} />
				) : (
					<label
						accessibilityId={`${accessibilityId}-line-${index}`}
						accessibilityLabel={`${accessibilityId}-line-${index}`}
						key={`line-${index}`}
						numberOfLines={0}
						style={lineStyle}
						value={line.text}
					/>
				),
			)}
		</scroll>;
	}

	private renderMessage(accessibilityId: string, message: string, palette?: Palette): void {
		const messageStyle = new Style<Label>({
			...theme.text.sub,
			color: palette?.muted_on_surface.hex ?? paletteDefaults.mutedOnSurface,
			textAlign: 'center',
		});

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			style={styles.messageContainer}
		>
			<label numberOfLines={0} style={messageStyle} value={message} />
		</view>;
	}
}

const styles = {
	blankLine: new Style<View>({
		height: theme.scale(12),
		width: '100%',
	}),
	messageContainer: new Style<View>({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		paddingBottom: theme.scale(24),
		paddingLeft: theme.scale(14),
		paddingRight: theme.scale(14),
		paddingTop: theme.scale(24),
		width: '100%',
	}),
	scroll: new Style<ScrollView>({
		flexGrow: 1,
		paddingLeft: theme.scale(14),
		paddingRight: theme.scale(14),
		width: '100%',
	}),
};
