import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { CachedImage } from './CachedImage';

export interface ArtistLogoViewModel {
	accessibilityId?: string;
	containerStyle?: Style<View>;
	fallbackText?: string | null;
	fallbackTextStyle?: Style<Label>;
	logoSource?: string | null;
	logoStyle?: Style<ImageView>;
	numberOfLines?: number;
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

		const numberOfLines =
			this.viewModel.numberOfLines === undefined ? 0 : this.viewModel.numberOfLines;

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
				<layout style={styles.fallbackTextPadding}>
					<label
						accessibilityId={accessibilityId ? `${accessibilityId}-text` : undefined}
						accessibilityLabel={accessibilityId ? `${accessibilityId}-text` : undefined}
						numberOfLines={numberOfLines}
						style={fallbackTextStyle ?? styles.fallbackText}
						value={fallbackText}
					/>
				</layout>
			) : null}
		</view>;
	}
}

const styles = {
	fallbackText: new Style<Label>({
		...theme.text.display,
	}),
	fallbackTextPadding: new Style<Layout>({
		padding: 8,
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
