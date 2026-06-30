import { describe, expect, it } from 'bun:test';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { type FooterTab, FooterTabs } from '../models/App';
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

	it('returns to the origin tab once the cross-tab detail stack empties', async () => {
		const router = new BackNavRouter();
		const switched: Array<FooterTab> = [];
		router.setTabSwitcher((tab) => switched.push(tab));
		router.setActiveTab(FooterTabs.library);
		router.setReturnTo(FooterTabs.library, FooterTabs.home);
		const detail = stubController();
		router.registerPage(detail.controller);

		router.unregisterPage(detail.controller);
		await Promise.resolve();

		expect(switched).toEqual([FooterTabs.home]);
	});

	it('does not return when an unwind is immediately followed by a re-push', async () => {
		const router = new BackNavRouter();
		const switched: Array<FooterTab> = [];
		router.setTabSwitcher((tab) => switched.push(tab));
		router.setActiveTab(FooterTabs.library);
		router.setReturnTo(FooterTabs.library, FooterTabs.home);
		const first = stubController();
		const second = stubController();
		router.registerPage(first.controller);

		router.unregisterPage(first.controller);
		router.registerPage(second.controller);
		await Promise.resolve();

		expect(switched).toEqual([]);
	});

	it('does not return after the pending return is cleared', async () => {
		const router = new BackNavRouter();
		const switched: Array<FooterTab> = [];
		router.setTabSwitcher((tab) => switched.push(tab));
		router.setActiveTab(FooterTabs.library);
		router.setReturnTo(FooterTabs.library, FooterTabs.home);
		const detail = stubController();
		router.registerPage(detail.controller);

		router.clearReturnTo();
		router.unregisterPage(detail.controller);
		await Promise.resolve();

		expect(switched).toEqual([]);
	});

	it('does not return when the target tab is no longer active', async () => {
		const router = new BackNavRouter();
		const switched: Array<FooterTab> = [];
		router.setTabSwitcher((tab) => switched.push(tab));
		router.setActiveTab(FooterTabs.library);
		router.setReturnTo(FooterTabs.library, FooterTabs.home);
		const detail = stubController();
		router.registerPage(detail.controller);

		router.setActiveTab(FooterTabs.home);
		router.unregisterPage(detail.controller);
		await Promise.resolve();

		expect(switched).toEqual([]);
	});

	it('ignores a return whose origin equals its target', async () => {
		const router = new BackNavRouter();
		const switched: Array<FooterTab> = [];
		router.setTabSwitcher((tab) => switched.push(tab));
		router.setActiveTab(FooterTabs.library);
		router.setReturnTo(FooterTabs.library, FooterTabs.library);
		const detail = stubController();
		router.registerPage(detail.controller);

		router.unregisterPage(detail.controller);
		await Promise.resolve();

		expect(switched).toEqual([]);
	});
});
