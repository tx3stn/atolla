import 'jasmine/src/jasmine';
import type { Album } from 'atolla/src/models/Album';
import { FooterTabs, HeaderTabs } from 'atolla/src/models/App';
import { type AppServicesBag, appServices } from 'atolla/src/services/AppServices';
import { backNavRouter } from 'atolla/src/services/BackNavRouter';
import { AppShellStore } from 'atolla/src/stores/AppShell';
import { headerStore } from 'atolla/src/stores/Header';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';

function fakeController(): NavigationController {
	return {
		pop: jasmine.createSpy('pop'),
		popToSelf: jasmine.createSpy('popToSelf'),
		push: jasmine.createSpy('push'),
	} as unknown as NavigationController;
}

function setServices(overrides: Partial<AppServicesBag> = {}): void {
	const stub = {} as unknown;
	appServices.set({
		animationsEnabled: false,
		barColors: stub as AppServicesBag['barColors'],
		connectionMode: 'online',
		downloadingCount: 0,
		downloadService: stub as AppServicesBag['downloadService'],
		gridColumns: 3,
		imageCache: stub as AppServicesBag['imageCache'],
		language: 'en',
		modalSlot: stub as AppServicesBag['modalSlot'],
		onRequestModeChange: async () => true,
		paletteQueue: stub as AppServicesBag['paletteQueue'],
		paletteService: stub as AppServicesBag['paletteService'],
		playbackOrchestrator: stub as AppServicesBag['playbackOrchestrator'],
		playbackStore: {
			album: null,
			artistLogoUrl: null,
			track: null,
		} as unknown as AppServicesBag['playbackStore'],
		toastService: stub as AppServicesBag['toastService'],
		toastSlot: stub as AppServicesBag['toastSlot'],
		transport: { getArtist: () => Promise.resolve(null) } as unknown as AppServicesBag['transport'],
		...overrides,
	});
}

describe('AppShellStore', () => {
	let store: AppShellStore;

	beforeEach(() => {
		store = new AppShellStore();
		setServices();
	});

	afterEach(() => {
		appServices.clear();
	});

	it('starts on the home tab', () => {
		expect(store.activeFooterTab).toBe(FooterTabs.home);
	});

	it('switches the active tab, pops the previously active controller, and notifies', () => {
		const home = fakeController();
		store.registerController(FooterTabs.home, home);
		store.registerController(FooterTabs.search, fakeController());
		const listener = jasmine.createSpy('listener');
		store.subscribe(listener);

		store.handleFooterTabTap(FooterTabs.search);

		expect(store.activeFooterTab).toBe(FooterTabs.search);
		expect(home.popToSelf).toHaveBeenCalledWith(false);
		expect(listener).toHaveBeenCalled();
	});

	it('setActiveTab updates backNavRouter and only notifies on a real change', () => {
		const setActiveTab = spyOn(backNavRouter, 'setActiveTab');
		const listener = jasmine.createSpy('listener');
		store.subscribe(listener);

		store.setActiveTab(FooterTabs.library);
		store.setActiveTab(FooterTabs.library);

		expect(setActiveTab).toHaveBeenCalledWith(FooterTabs.library);
		expect(store.activeFooterTab).toBe(FooterTabs.library);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('pushes a detail onto the active tab controller', () => {
		const home = fakeController();
		store.registerController(FooterTabs.home, home);

		store.handleNowPlayingOpenPlaylist({ id: 'p1' } as never);

		expect(home.push).toHaveBeenCalled();
	});

	it('falls back to the Library tab when the active tab has no controller', () => {
		const library = fakeController();
		store.registerController(FooterTabs.library, library);
		store.setActiveTab(FooterTabs.settings);

		store.handleNowPlayingOpenPlaylist({ id: 'p1' } as never);

		expect(library.push).toHaveBeenCalled();
		expect(store.activeFooterTab).toBe(FooterTabs.library);
	});

	it('resolves the now-playing album and pushes it', () => {
		const home = fakeController();
		store.registerController(FooterTabs.home, home);
		setServices({
			playbackStore: {
				album: { id: 'a1' } as unknown as Album,
				artistLogoUrl: null,
				track: null,
			} as unknown as AppServicesBag['playbackStore'],
		});

		store.handleNowPlayingAlbumTap();

		expect(home.push).toHaveBeenCalled();
	});

	it('does not push when there is no now-playing album to resolve', () => {
		const home = fakeController();
		store.registerController(FooterTabs.home, home);

		store.handleNowPlayingAlbumTap();

		expect(home.push).not.toHaveBeenCalled();
	});

	it('dismisses the detail and lands on the tapped Library section', () => {
		const home = fakeController();
		const library = fakeController();
		store.registerController(FooterTabs.home, home);
		store.registerController(FooterTabs.library, library);
		const onTabTap = jasmine.createSpy('onTabTap');
		headerStore.setDescriptor(FooterTabs.library, {
			activeTab: HeaderTabs.albums,
			kind: 'library',
			letterFilter: null,
			onAlphabetLetterTap: () => {},
			onTabTap,
		});

		store.handleDetailSectionTap(HeaderTabs.artists);

		expect(home.popToSelf).toHaveBeenCalledWith(false);
		expect(library.popToSelf).toHaveBeenCalledWith(false);
		expect(store.activeFooterTab).toBe(FooterTabs.library);
		expect(onTabTap).toHaveBeenCalledWith(HeaderTabs.artists);
	});

	it('reports nav readiness once home, library and search are registered', () => {
		expect(store.areNavTabsReady()).toBe(false);
		store.registerController(FooterTabs.home, fakeController());
		store.registerController(FooterTabs.library, fakeController());
		expect(store.areNavTabsReady()).toBe(false);
		store.registerController(FooterTabs.search, fakeController());
		expect(store.areNavTabsReady()).toBe(true);
	});

	it('reset clears controllers, returns to home, and notifies', () => {
		store.registerController(FooterTabs.home, fakeController());
		store.registerController(FooterTabs.library, fakeController());
		store.registerController(FooterTabs.search, fakeController());
		store.setActiveTab(FooterTabs.search);
		const listener = jasmine.createSpy('listener');
		store.subscribe(listener);

		store.reset();

		expect(store.activeFooterTab).toBe(FooterTabs.home);
		expect(store.areNavTabsReady()).toBe(false);
		expect(listener).toHaveBeenCalled();
	});
});
