import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { CachedImage } from './CachedImage';

export interface ArtistLogoViewModel {
	accessibilityId?: string;
	containerStyle?: Style<View>;
	fallbackText?: string | null;
	fallbackTextStyle?: Style<Label>;
	logoSource?: string | null;
	logoStyle?: Style<ImageView>;
	onTap?: () => void;
}

export class ArtistLogo extends Component<ArtistLogoViewModel> {
	onRender() {
		const {
			accessibilityId,
			containerStyle,
			fallbackText,
			fallbackTextStyle,
			logoSource,
			logoStyle,
			onTap,
		} = this.viewModel;

		<view
			accessibilityId={accessibilityId ?? 'artist-logo'}
			accessibilityLabel={accessibilityId ?? 'artist-logo'}
			onTap={onTap}
			style={containerStyle ?? styles.logoArea}
		>
			{logoSource ? (
				<CachedImage
					category='artist_logo'
					objectFit='contain'
					style={logoStyle ?? styles.logoImage}
					url={logoSource}
				/>
			) : fallbackText ? (
				<view style={styles.fallbackTextPadding}>
					<label
						accessibilityId={accessibilityId ? `${accessibilityId}-text` : undefined}
						accessibilityLabel={accessibilityId ? `${accessibilityId}-text` : undefined}
						numberOfLines={0}
						style={fallbackTextStyle ?? styles.fallbackText}
						value={fallbackText}
					/>
				</view>
			) : null}
		</view>;
	}
}

const styles = {
	fallbackText: new Style<Label>({
		...theme.text.display,
	}),
	fallbackTextPadding: new Style<View>({
		padding: 12,
	}),
	logoArea: new Style<View>({
		slowClipping: true,
		width: '100%',
	}),
	logoImage: new Style<ImageView>({
		height: '100%',
		width: '100%',
	}),
};
