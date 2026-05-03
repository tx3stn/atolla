import 'jasmine/src/jasmine';
import { ImageCache } from 'atolla/src/services/ImageCache';

describe('ImageCacheManager', () => {
	it('clears only selected image categories', async () => {
		const store = new RecordingImageStore();
		const cache = new ImageCache(store);

		await cache.clearSelected({
			albumArt: true,
			albumArtBlurred: false,
			artistImage: false,
			artistLogo: false,
			genreImage: false,
			playlistImage: true,
			tracks: false,
			waveformData: false,
		});

		expect(store.removeCalls.length).toBe(4);
		expect(store.removeCalls).toContain('image_cache:album_art');
		expect(store.removeCalls).toContain('image_cache:album_art_thumb');
		expect(store.removeCalls).toContain('image_cache:playlist_image');
		expect(store.removeCalls).toContain('image_cache:playlist_image_thumb');
	});

	it('removes category-prefixed keys when fetchAll is available', async () => {
		const store = new RecordingImageStore({
			'album_art_blurred:https://example.com/a.jpg': true,
			'album_art:https://example.com/a.jpg': true,
			'artist_image:https://example.com/b.jpg': true,
		});
		const cache = new ImageCache(store);

		await cache.clearSelected({
			albumArt: true,
			albumArtBlurred: true,
			artistImage: false,
			artistLogo: false,
			genreImage: false,
			playlistImage: false,
			tracks: false,
			waveformData: false,
		});

		expect(store.removeCalls).toContain('album_art:https://example.com/a.jpg');
		expect(store.removeCalls).toContain('album_art_blurred:https://example.com/a.jpg');
		expect(store.removeCalls).toContain('image_cache:album_art');
		expect(store.removeCalls).toContain('image_cache:album_art_blurred');
		expect(store.removeCalls).not.toContain('artist_image:https://example.com/b.jpg');
	});
});

class RecordingImageStore {
	removeCalls: Array<string> = [];

	constructor(private entries: Record<string, unknown> = {}) {}

	fetchAll(): Promise<Record<string, unknown>> {
		return Promise.resolve(this.entries);
	}

	remove(key: string): Promise<void> {
		this.removeCalls.push(key);
		return Promise.resolve();
	}
}
