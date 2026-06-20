export interface JellyfinMediaStream {
	BitDepth?: number;
	BitRate?: number;
	Codec?: string;
	SampleRate?: number;
	Type?: string;
}

export interface JellyfinMediaSource {
	Bitrate?: number;
	Container?: string;
	MediaStreams?: Array<JellyfinMediaStream>;
}

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
	MediaSources?: Array<JellyfinMediaSource>;
	Overview?: string;
	ParentIndexNumber?: number;
	ParentLogoImageTag?: string;
	ParentLogoItemId?: string;
	PlaylistItemId?: string;
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

// A `/Years` result item. Its Type is "Year" (outside the music item types), so
// it stays separate from JellyfinBaseItemDto; only the year value matters here.
export interface JellyfinYearItem {
	Name?: string;
	ProductionYear?: number;
}

export interface JellyfinListEnvelope<TItem> {
	Items: Array<TItem>;
	StartIndex: number;
	TotalRecordCount: number;
}
