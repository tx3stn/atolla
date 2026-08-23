import type { ImageCategory } from 'atolla_core/src/services/ImageCache';
import { buildImageSource } from 'atolla_core/src/services/ImageSource';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView } from 'valdi_tsx/src/NativeTemplateElements';

export interface CachedImageViewModel {
	cacheVersion?: number;
	category: ImageCategory;
	id?: string | null;
	objectFit?: 'cover' | 'contain';
	style?: Style<ImageView>;
	url?: string | null;
}

export class CachedImage extends Component<CachedImageViewModel> {
	private lastId?: string | null;
	private lastUrl?: string | null;
	private lastCategory?: ImageCategory;
	private lastCacheVersion?: number;
	private cachedSource = '';

	onRender(): void {
		const { category, cacheVersion, id, objectFit = 'cover', style, url } = this.viewModel;
		// a caller with neither an address nor a fetch source has nothing to render; a caller with
		// only a url addresses by that url, which is how non-Jellyfin images stay expressible
		const address = id || url;
		if (!address) {
			return;
		}

		if (
			id !== this.lastId ||
			url !== this.lastUrl ||
			category !== this.lastCategory ||
			cacheVersion !== this.lastCacheVersion
		) {
			this.lastId = id;
			this.lastUrl = url;
			this.lastCategory = category;
			this.lastCacheVersion = cacheVersion;
			this.cachedSource = buildImageSource({ category, id: address, url });
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
