export const JellyfinMusicItemTypes = {
	Audio: 'Audio',
	MusicAlbum: 'MusicAlbum',
	MusicArtist: 'MusicArtist',
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
	ImageTags?: Record<string, string>;
	IndexNumber?: number;
	MediaSources?: Array<unknown>;
	Overview?: string;
	ParentLogoImageTag?: string;
	ParentLogoItemId?: string;
	PremiereDate?: string;
	ProductionYear?: number;
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

export interface JellyfinPlaylistDetailsDto {
	ItemIds?: Array<string>;
}

export interface JellyfinListEnvelope<TItem> {
	Items: Array<TItem>;
	StartIndex: number;
	TotalRecordCount: number;
}
