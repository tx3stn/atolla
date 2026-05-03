export const SortOrders = {
	aToZ: 'a-z',
	newToOld: 'new-old',
	oldToNew: 'old-new',
	zToA: 'z-a',
} as const;

export type SortOrder = (typeof SortOrders)[keyof typeof SortOrders];
