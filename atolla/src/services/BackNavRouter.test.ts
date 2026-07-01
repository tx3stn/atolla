import { describe, expect, it } from 'bun:test';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { FooterTabs } from '../models/App';
import { BackNavRouter } from './BackNavRouter';

function stubController(): { controller: NavigationController; popped: () => number } {
	let count = 0;
	const controller = {
		pop: () => {
			count += 1;
		},
	} as unknown as NavigationController;
	return { controller, popped: () => count };
}

describe('BackNavRouter', () => {
	it('pops the top page of the active tab', () => {
		const router = new BackNavRouter();
		router.setActiveTab(FooterTabs.library);
		const first = stubController();
		const second = stubController();
		router.registerPage(first.controller);
		router.registerPage(second.controller);

		expect(router.goBack()).toBe(true);

		expect(second.popped()).toBe(1);
		expect(first.popped()).toBe(0);
	});

	it('falls back to the page below once the top is removed', () => {
		const router = new BackNavRouter();
		router.setActiveTab(FooterTabs.library);
		const first = stubController();
		const second = stubController();
		router.registerPage(first.controller);
		router.registerPage(second.controller);
		router.unregisterPage(second.controller);

		router.goBack();

		expect(first.popped()).toBe(1);
	});

	it('keeps each tab stack independent and pops only the active one', () => {
		const router = new BackNavRouter();
		router.setActiveTab(FooterTabs.library);
		const libraryPage = stubController();
		router.registerPage(libraryPage.controller);

		router.setActiveTab(FooterTabs.home);
		const homePage = stubController();
		router.registerPage(homePage.controller);

		router.setActiveTab(FooterTabs.library);
		expect(router.goBack()).toBe(true);

		expect(libraryPage.popped()).toBe(1);
		expect(homePage.popped()).toBe(0);
	});

	it('returns false when the active tab has no pushed pages', () => {
		const router = new BackNavRouter();
		router.setActiveTab(FooterTabs.settings);

		expect(router.goBack()).toBe(false);
	});

	it('returns false before an active tab is set', () => {
		const router = new BackNavRouter();
		const page = stubController();
		router.registerPage(page.controller);

		expect(router.goBack()).toBe(false);
		expect(page.popped()).toBe(0);
	});

	it('exposes the first page pushed into a tab so the shell can unwind it', () => {
		const router = new BackNavRouter();
		router.setActiveTab(FooterTabs.library);
		const first = stubController();
		const second = stubController();
		router.registerPage(first.controller);
		router.registerPage(second.controller);

		expect(router.firstPageOf(FooterTabs.library)).toBe(first.controller);
	});

	it('has no first page for a tab with no pushed pages', () => {
		const router = new BackNavRouter();
		router.setActiveTab(FooterTabs.home);

		expect(router.firstPageOf(FooterTabs.home)).toBeUndefined();
	});
});
