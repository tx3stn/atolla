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
