// @ts-nocheck
import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { ImageCache, ImageCategory } from '../../services/ImageCache';
import { theme } from '../../theme';
import { ArtistLogo } from './ArtistLogo';
import { CachedImage } from './CachedImage';
import { TappableIcon } from './TappableIcon';

export interface DetailHeaderViewModel {
	animationsEnabled: boolean;
	artworkCategory: ImageCategory;
	artworkSource: string | null;
	fallbackText?: string | null;
	imageCache?: ImageCache;
	logoSource?: string | null;
	onAddToQueue?: () => void;
	onArtistTap?: () => void;
	onDownload?: () => void;
	onPlay?: () => void;
	onShuffle?: () => void;
	subheaderLineOneLeft?: string | null;
	subheaderLineOneRight?: string | null;
	subheaderLineTwoLeft?: string | null;
	subheaderLineTwoRight?: string | null;
}

export class DetailHeader extends Component<DetailHeaderViewModel> {
	onRender() {
		const {
			artworkSource,
			fallbackText,
			logoSource,
			onAddToQueue,
			onArtistTap,
			onDownload,
			onPlay,
			onShuffle,
			subheaderLineOneLeft,
			subheaderLineOneRight,
			subheaderLineTwoLeft,
			subheaderLineTwoRight,
		} = this.viewModel;

		<layout style={styles.root}>
			<layout style={styles.headerRow}>
				<view style={styles.artworkTile}>
					{artworkSource && (
						<CachedImage
							category={this.viewModel.artworkCategory}
							imageCache={this.viewModel.imageCache}
							objectFit='cover'
							style={styles.artworkImage}
							url={artworkSource}
						/>
					)}
				</view>
				<layout style={styles.rightColumn}>
					<ArtistLogo
						fallbackText={fallbackText}
						imageCache={this.viewModel.imageCache}
						logoSource={logoSource}
						onTap={onArtistTap}
						testID='detail-header-artist-logo'
					/>
					<layout style={styles.buttonsRow}>
						<TappableIcon
							accessibilityLabel='detail-header-download-button'
							animationsEnabled={this.viewModel.animationsEnabled}
							icon={res.download}
							onTap={onDownload}
						/>
						<TappableIcon
							accessibilityLabel='detail-header-shuffle-button'
							animationsEnabled={this.viewModel.animationsEnabled}
							icon={res.shuffle}
							onTap={onShuffle}
						/>
						<TappableIcon
							accessibilityLabel='detail-header-add-to-queue-button'
							animationsEnabled={this.viewModel.animationsEnabled}
							icon={res.addtoqueue}
							onTap={onAddToQueue}
						/>
						<TappableIcon
							accessibilityLabel='detail-header-play-button'
							animationsEnabled={this.viewModel.animationsEnabled}
							icon={res.play}
							onTap={onPlay}
						/>
					</layout>
				</layout>
			</layout>
			{(subheaderLineOneLeft ||
				subheaderLineOneRight ||
				subheaderLineTwoLeft ||
				subheaderLineTwoRight) && (
				<layout style={styles.subheaderLines}>
					{(subheaderLineOneLeft || subheaderLineOneRight) && (
						<layout style={styles.subheaderLineRow}>
							<label
								numberOfLines={2}
								style={styles.subheaderLineOneLeftText}
								value={subheaderLineOneLeft ?? ''}
							/>
							{subheaderLineOneRight && (
								<label style={styles.subheaderLineOneRightText} value={subheaderLineOneRight} />
							)}
						</layout>
					)}
					{(subheaderLineTwoLeft || subheaderLineTwoRight) && (
						<layout style={styles.subheaderLineRowTwo}>
							<label style={styles.subheaderLineTwoLeftText} value={subheaderLineTwoLeft ?? ''} />
							{subheaderLineTwoRight && (
								<label style={styles.subheaderLineTwoRightText} value={subheaderLineTwoRight} />
							)}
						</layout>
					)}
				</layout>
			)}
		</layout>;
	}
}

const styles = {
	artworkImage: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style({
		aspectRatio: 1,
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		overflow: 'hidden',
		width: '50%',
	}),
	buttonsRow: new Style({
		alignItems: 'center',
		bottom: 0,
		columnGap: 4,
		flexDirection: 'row',
		justifyContent: 'flex-end',
		padding: 6,
		position: 'absolute',
		right: 0,
		width: '100%',
	}),
	headerRow: new Style({
		alignItems: 'stretch',
		flexDirection: 'row',
		width: '100%',
	}),
	rightColumn: new Style({
		alignSelf: 'stretch',
		flexDirection: 'column',
		marginLeft: 12,
		width: '46%',
	}),
	root: new Style({
		marginBottom: 12,
		padding: 4,
		width: '100%',
	}),
	subheaderLineOneLeftText: new Style<Label>({
		...theme.text.display,
		marginLeft: 12,
		marginTop: 10,
		paddingHorizontal: 4,
	}),
	subheaderLineOneRightText: new Style<Label>({
		...theme.text.sub,
		marginRight: 12,
		marginTop: 10,
		paddingHorizontal: 4,
	}),
	subheaderLineRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: '100%',
	}),
	subheaderLineRowTwo: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 3,
		width: '100%',
	}),
	subheaderLines: new Style({
		flexDirection: 'column',
		marginTop: 8,
		width: '100%',
	}),
	subheaderLineTwoLeftText: new Style<Label>({
		...theme.text.sub,
		marginLeft: 12,
		marginTop: 2,
		paddingHorizontal: 4,
	}),
	subheaderLineTwoRightText: new Style<Label>({
		...theme.text.sub,
		marginRight: 12,
		marginTop: 2,
		paddingHorizontal: 4,
	}),
};
