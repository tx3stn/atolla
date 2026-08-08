export interface CardDetailItem {
	artworkKey: string;
	id: string;
	kind: 'album' | 'artist' | 'playlist';
	lineOne: string;
	lineThree: string;
	lineTwo: string;
}

export const CardSizes = {
	regular: 'regular',
	small: 'small',
} as const;

export type CardSize = (typeof CardSizes)[keyof typeof CardSizes];

export const ConnectionModes = {
	offline: 'offline',
	online: 'online',
} as const;

export type ConnectionMode = (typeof ConnectionModes)[keyof typeof ConnectionModes];

export const FooterTabs = {
	home: 'home',
	library: 'library',
	search: 'search',
	settings: 'settings',
} as const;

export type FooterTab = (typeof FooterTabs)[keyof typeof FooterTabs];

export const HeaderTabs = {
	albums: 'ALBUMS',
	artists: 'ARTISTS',
	genres: 'GENRES',
	playlists: 'PLAYLISTS',
} as const;

export type HeaderTab = (typeof HeaderTabs)[keyof typeof HeaderTabs];
