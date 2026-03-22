// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView } from 'valdi_tsx/src/NativeTemplateElements';
import type { ImageCache, ImageCategory } from '../../services/ImageCache';

export interface CachedImageViewModel {
	category: ImageCategory;
	imageCache?: ImageCache;
	objectFit?: 'cover' | 'contain';
	style?: Style<ImageView>;
	url?: string | null;
}

export class CachedImage extends Component<CachedImageViewModel> {
	onRender(): void {
		const { category, imageCache, objectFit = 'cover', style, url } = this.viewModel;
		if (!url) return;
		const imageStyle = style ?? styles.defaultImage;

		if (!imageCache) {
			<image objectFit={objectFit} src={url} style={imageStyle} />;
			return;
		}

		const source = imageCache.getOrLoad(url, category);
		if (!source) return;

		<image objectFit={objectFit} src={source} style={imageStyle} />;
	}
}

const styles = {
	defaultImage: new Style<ImageView>({
		height: '100%',
		width: '100%',
	}),
};
