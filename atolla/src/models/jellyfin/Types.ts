export const JellyfinMusicItemTypes = {
	Audio: 'Audio',
	MusicAlbum: 'MusicAlbum',
	MusicArtist: 'MusicArtist',
	MusicGenre: 'MusicGenre',
	Playlist: 'Playlist',
} as const;

export type JellyfinMusicItemType =
	(typeof JellyfinMusicItemTypes)[keyof typeof JellyfinMusicItemTypes];

export interface JellyfinNameIdReference {
	Id: string;
	Name: string;
}

export interface JellyfinBaseItemIdentity {
	Id: string;
	Name: string;
	Type: JellyfinMusicItemType;
}

export interface JellyfinBaseItemDto extends JellyfinBaseItemIdentity {
	Album?: string;
	AlbumArtist?: string;
	AlbumArtists?: Array<JellyfinNameIdReference>;
	AlbumId?: string;
	AlbumPrimaryImageTag?: string;
	ArtistItems?: Array<JellyfinNameIdReference>;
	ChildCount?: number;
	DateCreated?: string;
	GenreItems?: Array<JellyfinNameIdReference>;
	Genres?: Array<string>;
	ImageTags?: Record<string, string>;
	IndexNumber?: number;
	MediaSources?: Array<unknown>;
	Overview?: string;
	ParentLogoImageTag?: string;
	ParentLogoItemId?: string;
	PremiereDate?: string;
	ProductionYear?: number;
	RecursiveItemCount?: number;
	RunTimeTicks?: number;
}

export interface JellyfinArtistItem extends JellyfinBaseItemDto {
	Type: 'MusicArtist';
}

export interface JellyfinAlbumItem extends JellyfinBaseItemDto {
	Type: 'MusicAlbum';
}

export interface JellyfinTrackItem extends JellyfinBaseItemDto {
	Type: 'Audio';
}

export interface JellyfinPlaylistItem extends JellyfinBaseItemDto {
	ItemIds?: Array<string>;
	Type: 'Playlist';
}

export interface JellyfinGenreItem extends JellyfinBaseItemDto {
	Type: 'MusicGenre';
}

export interface JellyfinPlaylistDetailsDto {
	ItemIds?: Array<string>;
}

export interface JellyfinListEnvelope<TItem> {
	Items: Array<TItem>;
	StartIndex: number;
	TotalRecordCount: number;
}
