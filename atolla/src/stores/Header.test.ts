import { describe, expect, it } from 'bun:test';
import { FooterTabs, HeaderTabs } from '../models/App';
import { HeaderCollapse, HeaderStore } from './Header';

describe('HeaderStore', () => {
	it('returns the descriptor set for a tab', () => {
		const store = new HeaderStore();
		store.setDescriptor(FooterTabs.home, { kind: 'title', title: 'Home' });

		expect(store.descriptorFor(FooterTabs.home)).toEqual({ kind: 'title', title: 'Home' });
	});

	it('keeps descriptors independent per tab', () => {
		const store = new HeaderStore();
		store.setDescriptor(FooterTabs.home, { kind: 'title', title: 'Home' });
		store.setDescriptor(FooterTabs.settings, { kind: 'title', title: 'Settings' });

		expect(store.descriptorFor(FooterTabs.home)).toEqual({ kind: 'title', title: 'Home' });
		expect(store.descriptorFor(FooterTabs.settings)).toEqual({ kind: 'title', title: 'Settings' });
	});

	it('notifies subscribers when a descriptor changes', () => {
		const store = new HeaderStore();
		let calls = 0;
		store.subscribe(() => {
			calls += 1;
		});

		store.setDescriptor(FooterTabs.home, { kind: 'title', title: 'Home' });

		expect(calls).toBe(1);
	});

	it('defaults to visible', () => {
		const store = new HeaderStore();

		expect(store.isVisible()).toBe(true);
	});

	it('notifies on a visibility change and ignores no-op sets', () => {
		const store = new HeaderStore();
		let calls = 0;
		store.subscribe(() => {
			calls += 1;
		});

		store.setVisible(true);
		expect(calls).toBe(0);

		store.setVisible(false);
		expect(store.isVisible()).toBe(false);
		expect(calls).toBe(1);
	});

	it('stops notifying after unsubscribe', () => {
		const store = new HeaderStore();
		let calls = 0;
		const unsubscribe = store.subscribe(() => {
			calls += 1;
		});

		unsubscribe();
		store.setVisible(false);

		expect(calls).toBe(0);
	});

	it('has no active detail section by default', () => {
		const store = new HeaderStore();

		expect(store.activeDetailSection()).toBeNull();
	});

	it('reports the pushed detail section and notifies', () => {
		const store = new HeaderStore();
		let calls = 0;
		store.subscribe(() => {
			calls += 1;
		});

		store.pushDetailSection(HeaderTabs.albums);

		expect(store.activeDetailSection()).toBe(HeaderTabs.albums);
		expect(calls).toBe(1);
	});

	it('reports the topmost section for nested pushes and restores on clear', () => {
		const store = new HeaderStore();
		store.pushDetailSection(HeaderTabs.albums);
		const artistId = store.pushDetailSection(HeaderTabs.artists);

		expect(store.activeDetailSection()).toBe(HeaderTabs.artists);

		store.clearDetailSection(artistId);

		expect(store.activeDetailSection()).toBe(HeaderTabs.albums);
	});

	it('clears the right entry when a section is cleared out of order', () => {
		const store = new HeaderStore();
		const albumsId = store.pushDetailSection(HeaderTabs.albums);
		store.pushDetailSection(HeaderTabs.artists);

		store.clearDetailSection(albumsId);

		expect(store.activeDetailSection()).toBe(HeaderTabs.artists);
	});

	it('returns to no active section once the last one is cleared', () => {
		const store = new HeaderStore();
		const id = store.pushDetailSection(HeaderTabs.playlists);

		store.clearDetailSection(id);

		expect(store.activeDetailSection()).toBeNull();
	});

	it('ignores clearing an unknown section id without notifying', () => {
		const store = new HeaderStore();
		let calls = 0;
		store.subscribe(() => {
			calls += 1;
		});

		store.clearDetailSection(999);

		expect(calls).toBe(0);
	});
});

describe('HeaderCollapse', () => {
	it('hides the header after scrolling down past the trigger', () => {
		const store = new HeaderStore();
		const collapse = new HeaderCollapse(store);

		collapse.handleScroll(20);
		collapse.handleScroll(60);

		expect(store.isVisible()).toBe(false);
	});

	it('shows the header after scrolling back up past the trigger', () => {
		const store = new HeaderStore();
		const collapse = new HeaderCollapse(store);
		collapse.handleScroll(20);
		collapse.handleScroll(60);
		expect(store.isVisible()).toBe(false);

		collapse.handleScroll(20);

		expect(store.isVisible()).toBe(true);
	});

	it('keeps the header visible near the top', () => {
		const store = new HeaderStore();
		const collapse = new HeaderCollapse(store);
		collapse.handleScroll(20);
		collapse.handleScroll(60);
		expect(store.isVisible()).toBe(false);

		collapse.handleScroll(4);

		expect(store.isVisible()).toBe(true);
	});

	it('ignores small jitters under the trigger', () => {
		const store = new HeaderStore();
		const collapse = new HeaderCollapse(store);

		collapse.handleScroll(10);
		collapse.handleScroll(18);

		expect(store.isVisible()).toBe(true);
	});

	it('shows the header on reset', () => {
		const store = new HeaderStore();
		const collapse = new HeaderCollapse(store);
		collapse.handleScroll(20);
		collapse.handleScroll(60);
		expect(store.isVisible()).toBe(false);

		collapse.reset();

		expect(store.isVisible()).toBe(true);
	});
});
