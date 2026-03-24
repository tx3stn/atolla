// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { ImageCache } from '../../services/ImageCache';
import { theme } from '../../theme';
import { CachedImage } from './CachedImage';

export interface ArtistLogoViewModel {
	fallbackText?: string | null;
	imageCache?: ImageCache;
	logoSource?: string | null;
	onTap?: () => void;
	testID?: string;
}

export class ArtistLogo extends Component<ArtistLogoViewModel> {
	onRender() {
		const { fallbackText, logoSource, onTap, testID } = this.viewModel;

		<view
			accessibilityLabel={testID ?? 'artist-logo'}
			onTap={onTap}
			style={styles.logoArea}
			testID={testID ?? 'artist-logo'}
		>
			{logoSource ? (
				<CachedImage
					category='artist_logo'
					imageCache={this.viewModel.imageCache}
					objectFit='contain'
					style={styles.logoImage}
					url={logoSource}
				/>
			) : fallbackText ? (
				<label numberOfLines={0} style={styles.fallbackText} value={fallbackText} />
			) : null}
		</view>;
	}
}

const styles = {
	fallbackText: new Style<Label>({
		...theme.text.display,
		padding: 12,
	}),
	logoArea: new Style({
		overflow: 'hidden',
		width: '100%',
	}),
	logoImage: new Style<ImageView>({
		height: '100%',
		width: '100%',
	}),
};
