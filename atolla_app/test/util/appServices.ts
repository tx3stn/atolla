import { ConnectionModes } from 'atolla_app/src/models/App';
import { type AppServicesBag, appServices } from 'atolla_app/src/services/AppServices';
import { BarColorStore } from 'atolla_app/src/stores/BarColor';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { makeTestViewCache } from './viewCache';

// populates the appServices singleton for specs that only care about a field or two of the bag.
// callers must appServices.clear() in afterEach, or a live subscriber in another suite re-renders
// against this bag
export function setTestAppServices(overrides: Partial<AppServicesBag> = {}): void {
	const stub = {} as unknown;
	appServices.set({
		barColors: new BarColorStore(),
		connectionMode: ConnectionModes.online,
		downloadingCount: 0,
		downloadService: stub as AppServicesBag['downloadService'],
		lyricsService: stub as AppServicesBag['lyricsService'],
		modalSlot: new DetachedSlot(),
		networkStatus: stub as AppServicesBag['networkStatus'],
		onRequestModeChange: async () => true,
		paletteQueue: stub as AppServicesBag['paletteQueue'],
		paletteService: stub as AppServicesBag['paletteService'],
		playbackOrchestrator: stub as AppServicesBag['playbackOrchestrator'],
		playbackStore: stub as AppServicesBag['playbackStore'],
		preferences: stub as AppServicesBag['preferences'],
		toastService: stub as AppServicesBag['toastService'],
		toastSlot: new DetachedSlot(),
		transport: stub as AppServicesBag['transport'],
		viewCache: makeTestViewCache(),
		...overrides,
	});
}
