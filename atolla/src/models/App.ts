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

export const SortOrders = {
	aToZ: 'a-z',
	newToOld: 'new-old',
	oldToNew: 'old-new',
	zToA: 'z-a',
} as const;

export type SortOrder = (typeof SortOrders)[keyof typeof SortOrders];
