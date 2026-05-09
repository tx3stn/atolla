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
	private lastUrl?: string | null;
	private lastCategory?: ImageCategory;
	private lastCacheVersion?: number;
	private cachedSource = '';

	onRender(): void {
		const { category, cacheVersion, objectFit = 'cover', style, url } = this.viewModel;
		if (!url) {
			return;
		}

		if (
			url !== this.lastUrl ||
			category !== this.lastCategory ||
			cacheVersion !== this.lastCacheVersion
		) {
			this.lastUrl = url;
			this.lastCategory = category;
			this.lastCacheVersion = cacheVersion;
			this.cachedSource = buildImageSource(url, category);
		}

		const imageStyle = style ?? styles.defaultImage;
		<image objectFit={objectFit} src={this.cachedSource} style={imageStyle} />;
	}
}

const styles = {
	defaultImage: new Style<ImageView>({
		height: '100%',
		width: '100%',
	}),
};
