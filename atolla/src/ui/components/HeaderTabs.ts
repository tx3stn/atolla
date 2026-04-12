export const HeaderTabs = {
	albums: 'ALBUMS',
	artists: 'ARTISTS',
	genres: 'GENRES',
	playlists: 'PLAYLISTS',
} as const;

export type HeaderTab = (typeof HeaderTabs)[keyof typeof HeaderTabs];
