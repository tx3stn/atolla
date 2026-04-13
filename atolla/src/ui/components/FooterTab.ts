export const FooterTabs = {
	home: 'home',
	library: 'library',
	search: 'search',
	settings: 'settings',
} as const;

export type FooterTab = (typeof FooterTabs)[keyof typeof FooterTabs];
