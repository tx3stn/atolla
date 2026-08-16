export const ImageCategories = {
	album: 'album_art',
	albumBlurred: 'album_art_blurred',
	albumThumb: 'album_art_thumb',
	artist: 'artist_image',
	artistLogo: 'artist_logo',
	artistThumb: 'artist_image_thumb',
	genre: 'genre_art',
	playlist: 'playlist_image',
	playlistThumb: 'playlist_image_thumb',
} as const;

export type ImageCategory = (typeof ImageCategories)[keyof typeof ImageCategories];

export interface ClearCacheSelection {
	albumArt: boolean;
	albumArtBlurred: boolean;
	artistImage: boolean;
	artistLogo: boolean;
	genreImage: boolean;
	playlistImage: boolean;
	tracks: boolean;
	waveformData: boolean;
}

interface ImageCacheStore {
	fetchAll?(): Promise<Record<string, unknown>>;
	remove?(key: string): Promise<void>;
}

export class ImageCache {
	constructor(private store: ImageCacheStore) {}

	async clearSelected(selection: ClearCacheSelection): Promise<void> {
		const categories: Array<ImageCategory> = [];
		if (selection.artistImage) categories.push(ImageCategories.artist, ImageCategories.artistThumb);
		if (selection.artistLogo) categories.push(ImageCategories.artistLogo);
		if (selection.albumArt) categories.push(ImageCategories.album, ImageCategories.albumThumb);
		if (selection.albumArtBlurred) categories.push(ImageCategories.albumBlurred);
		if (selection.genreImage) categories.push(ImageCategories.genre);
		if (selection.playlistImage)
			categories.push(ImageCategories.playlist, ImageCategories.playlistThumb);

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
				// fall through to namespace marker removal
			}
		}

		try {
			await this.store.remove?.(`image_cache:${category}`);
		} catch {
			// best effort clear operation
		}
	}
}
