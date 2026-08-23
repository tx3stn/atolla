import { describe, expect, it } from 'bun:test';
import {
	atollaCacheHost,
	atollaCacheScheme,
	buildImageSource,
	extractImageTag,
	imageCacheKey,
	normalizeImageUrlForCategory,
} from './ImageSource';

function params(source: string): URLSearchParams {
	return new URL(source).searchParams;
}

describe('buildImageSource', () => {
	it('addresses by id alone when no url is available', () => {
		const source = buildImageSource({ category: 'artist_logo', id: 'artist-1' });
		expect(source).toBe(`${atollaCacheScheme}://${atollaCacheHost}?c=artist_logo&id=artist-1`);
	});

	it('carries the tag separately so it never becomes part of the address', () => {
		const source = buildImageSource({
			category: 'album_art',
			id: 'album-1',
			url: 'https://media.example.com/Items/album-1/Images/Primary?tag=xyz',
		});

		expect(params(source).get('id')).toBe('album-1');
		expect(params(source).get('t')).toBe('xyz');
	});

	it('produces the same address with and without a url, so a cached image resolves offline', () => {
		const withUrl = buildImageSource({
			category: 'artist_logo',
			id: 'artist-1',
			url: 'https://media.example.com/Items/artist-1/Images/Logo?tag=xyz',
		});
		const withoutUrl = buildImageSource({ category: 'artist_logo', id: 'artist-1' });

		expect(params(withUrl).get('id')).toBe(params(withoutUrl).get('id'));
		expect(params(withUrl).get('c')).toBe(params(withoutUrl).get('c'));
	});

	it('addresses a non-Jellyfin image by its url', () => {
		const url = 'https://cdn.example.com/cover.jpg';
		const source = buildImageSource({ category: 'album_art', id: url, url });

		expect(params(source).get('id')).toBe(url);
		expect(params(source).get('t')).toBeNull();
	});

	it('strips api_key and applies category sizing to the fetch source', () => {
		const source = buildImageSource({
			category: 'album_art_thumb',
			id: 'album-1',
			url: 'https://media.example.com/Items/album-1/Images/Primary?api_key=abc&tag=xyz',
		});

		expect(source).not.toContain('api_key');
		expect(params(source).get('u')).toBe(
			'https://media.example.com/Items/album-1/Images/Primary?tag=xyz&maxWidth=512&maxHeight=512&quality=85',
		);
	});

	it('omits the tag when the url carries none', () => {
		const source = buildImageSource({
			category: 'album_art',
			id: 'album-1',
			url: 'https://media.example.com/Items/album-1/Images/Primary',
		});

		expect(params(source).get('t')).toBeNull();
		expect(params(source).get('u')).toContain('/Items/album-1/Images/Primary');
	});
});

describe('extractImageTag', () => {
	it('reads the tag query param', () => {
		expect(extractImageTag('https://e.com/Items/1/Images/Primary?tag=abc')).toBe('abc');
	});

	it('returns null when absent or unparseable', () => {
		expect(extractImageTag('https://e.com/Items/1/Images/Primary')).toBeNull();
		expect(extractImageTag('not a url')).toBeNull();
	});
});

describe('normalizeImageUrlForCategory', () => {
	it('adds Jellyfin thumbnail params for thumb categories', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?api_key=abc&tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'album_art_thumb')).toBe(
			'https://media.example.com/Items/123/Images/Primary?api_key=abc&tag=xyz&maxWidth=512&maxHeight=512&quality=85',
		);
	});

	it('preserves explicit sizing params when already present', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?maxWidth=256&maxHeight=256';
		expect(normalizeImageUrlForCategory(url, 'album_art_thumb')).toBe(
			'https://media.example.com/Items/123/Images/Primary?maxWidth=256&maxHeight=256&quality=85',
		);
	});

	it('requests display-sized album art instead of the full-resolution original', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'album_art')).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=1280&maxHeight=1280&quality=90',
		);
	});

	it('sizes artist and playlist detail art to the header size', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'artist_image')).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=768&maxHeight=768&quality=85',
		);
		expect(normalizeImageUrlForCategory(url, 'playlist_image')).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=768&maxHeight=768&quality=85',
		);
	});

	it('sizes genre grid art down from the full-resolution original', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'genre_art')).toBe(
			'https://media.example.com/Items/123/Images/Primary?tag=xyz&maxWidth=512&maxHeight=512&quality=85',
		);
	});

	it('leaves transparent artist logos untouched so the alpha is preserved', () => {
		const url = 'https://media.example.com/Items/123/Images/Logo?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'artist_logo')).toBe(url);
	});

	it('requests the blurred backdrop at the same size as album art', () => {
		const url = 'https://media.example.com/Items/123/Images/Primary?tag=xyz';
		expect(normalizeImageUrlForCategory(url, 'album_art_blurred')).toBe(
			normalizeImageUrlForCategory(url, 'album_art'),
		);
	});

	it('leaves non-Jellyfin image urls unchanged for sized categories', () => {
		const url = 'https://cdn.example.com/cover.jpg';
		expect(normalizeImageUrlForCategory(url, 'album_art')).toBe(url);
	});
});

describe('imageCacheKey', () => {
	it('keys on category and id', () => {
		expect(imageCacheKey('playlist-1', 'playlist_image')).toBe('playlist_image:playlist-1');
	});
});
