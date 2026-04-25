import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView } from 'valdi_tsx/src/NativeTemplateElements';
import type { ImageCategory } from '../../services/ImageCache';
import { buildImageSource } from '../../services/ImageSource';

export interface CachedImageViewModel {
	cacheVersion?: number;
	category: ImageCategory;
	objectFit?: 'cover' | 'contain';
	style?: Style<ImageView>;
	url?: string | null;
}

export class CachedImage extends Component<CachedImageViewModel> {
	onRender(): void {
		const { category, objectFit = 'cover', style, url } = this.viewModel;
		if (!url) {
			return;
		}

		const imageStyle = style ?? styles.defaultImage;
		const source = buildImageSource(url, category);
		<image objectFit={objectFit} src={source} style={imageStyle} />;
	}
}

const styles = {
	defaultImage: new Style<ImageView>({
		height: '100%',
		width: '100%',
	}),
};
