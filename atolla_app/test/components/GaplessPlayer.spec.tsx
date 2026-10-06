import 'jasmine/src/jasmine';
import { PlayersStore, THIS_DEVICE_ID } from 'atolla_app/src/stores/Players';
import { GaplessPlayer } from 'atolla_app/src/ui/components/GaplessPlayer';
import { NativeAudioPlayer } from 'atolla_app/src/ui/components/NativeAudioPlayer';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { componentTypeFind } from 'foundation/test/util/componentTypeFind';
import { type IComponentTestDriver, valdiIt } from 'valdi_test/test/JSXTestUtils';

function mountPlayer(
	driver: IComponentTestDriver,
	multiRoom: boolean,
	playersStore: PlayersStore,
): GaplessPlayer {
	return driver.renderComponent(
		GaplessPlayer,
		{
			activeSourceUrl: null,
			featureFlags: { multiRoom },
			isPlaying: false,
			nextSourceUrl: null,
			playbackStore: new PlaybackStore(),
			playersStore,
		},
		undefined,
	);
}

function engineVolume(component: GaplessPlayer): number | undefined {
	const [engine] = componentTypeFind(component, NativeAudioPlayer);
	return engine.viewModel.volume;
}

describe('GaplessPlayer', () => {
	valdiIt('mutes the engine while this device is switched off', async (driver) => {
		const playersStore = new PlayersStore();
		const component = mountPlayer(driver, true, playersStore);

		playersStore.setEnabled(THIS_DEVICE_ID, false);

		expect(engineVolume(component)).toBe(0);
	});

	valdiIt('unmutes the engine when this device is switched back on', async (driver) => {
		const playersStore = new PlayersStore();
		playersStore.setEnabled(THIS_DEVICE_ID, false);
		const component = mountPlayer(driver, true, playersStore);

		playersStore.setEnabled(THIS_DEVICE_ID, true);

		expect(engineVolume(component)).toBe(1);
	});

	valdiIt('keeps the engine audible with multi-room off', async (driver) => {
		const playersStore = new PlayersStore();
		playersStore.setEnabled(THIS_DEVICE_ID, false);
		const component = mountPlayer(driver, false, playersStore);

		expect(engineVolume(component)).toBe(1);
	});
});
