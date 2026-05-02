// @ts-nocheck

export type ImageCategory =
	| 'artist_image'
	| 'artist_image_thumb'
	| 'artist_logo'
	| 'album_art'
	| 'album_art_thumb'
	| 'album_art_blurred'
	| 'playlist_image'
	| 'playlist_image_thumb';

export interface ClearCacheSelection {
	albumArt: boolean;
	albumArtBlurred: boolean;
	artistImage: boolean;
	artistLogo: boolean;
	playlistImage: boolean;
	tracks: boolean;
	waveformData: boolean;
}

interface ImageCacheStore {
	fetchAll?(): Promise<Record<string, unknown>>;
	remove?(key: string): Promise<void>;
}

export class ImageCacheManager {
	constructor(private store: ImageCacheStore) {}

	async clearSelected(selection: ClearCacheSelection): Promise<void> {
		const categories: Array<ImageCategory> = [];
		if (selection.artistImage) categories.push('artist_image', 'artist_image_thumb');
		if (selection.artistLogo) categories.push('artist_logo');
		if (selection.albumArt) categories.push('album_art', 'album_art_thumb');
		if (selection.albumArtBlurred) categories.push('album_art_blurred');
		if (selection.playlistImage) categories.push('playlist_image', 'playlist_image_thumb');

		await Promise.all(categories.map((category) => this.clearCategory(category)));
	}

	private async clearCategory(category: ImageCategory): Promise<void> {
		const prefix = `${category}:`;

		if (this.store.fetchAll && this.store.remove) {
			try {
				const all = await this.store.fetchAll();
				for (const key of Object.keys(all)) {
					if (key.startsWith(prefix)) {
						await this.store.remove(key);
					}
				}
			} catch {
				// Fall through to namespace marker removal.
			}
		}

		try {
			await this.store.remove?.(`image_cache:${category}`);
		} catch {
			// Best effort clear operation.
		}
	}
}

export { ImageCacheManager as ImageCache };
export type ImageCache = ImageCacheManager;
