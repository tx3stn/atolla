import { describe, expect, it } from 'bun:test';
import { syncStatusBannerText } from './syncStatusBannerText';

describe('syncStatusBannerText', () => {
	it('pluralises while syncing multiple changes', () => {
		expect(syncStatusBannerText({ completed: 0, status: 'syncing', total: 3 })).toBe(
			'syncing 3 changes…',
		);
	});

	it('uses the singular while syncing a single change', () => {
		expect(syncStatusBannerText({ completed: 0, status: 'syncing', total: 1 })).toBe(
			'syncing 1 change…',
		);
	});

	it('shows a simple confirmation when everything synced', () => {
		expect(syncStatusBannerText({ completed: 3, status: 'done', total: 3 })).toBe('synced');
	});

	it('shows the completed-of-total ratio on partial sync', () => {
		expect(syncStatusBannerText({ completed: 2, status: 'partial', total: 3 })).toBe(
			'2 of 3 synced',
		);
	});
});
