export const FooterTabs = {
	library: 'library',
	search: 'search',
	settings: 'settings',
} as const;

export type FooterTab = (typeof FooterTabs)[keyof typeof FooterTabs];
