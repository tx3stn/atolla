import 'jasmine/src/jasmine';
import type { LyricsService } from 'atolla_app/src/services/LyricsService';
import { LyricsModal } from 'atolla_app/src/ui/modals/LyricsModal';
import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import type { Track } from 'atolla_core/src/models/Track';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

const track: Track = {
	albumImageUrl: 'https://example.com/album.jpg',
	albumName: 'The Album',
	artistName: 'The Artist',
	duration: 180,
	id: 'track-1',
	name: 'The Track',
};

const lyrics: Lyrics = { lines: [{ text: 'a line' }], synced: false };

function lyricsService(overrides: Partial<LyricsService> = {}): LyricsService {
	return {
		get: () => undefined,
		load: () => Promise.resolve(lyrics),
		...overrides,
	} as unknown as LyricsService;
}

async function flush(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
	}
}

describe('LyricsModal', () => {
	valdiIt('shows the track it is displaying lyrics for', async (driver) => {
		const component = driver.renderComponent(
			LyricsModal,
			{ lyricsService: lyricsService(), onDismiss: () => {}, track },
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-modal-track'),
		).toBeDefined();
	});

	valdiIt('paints resident lyrics without waiting on a load', async (driver) => {
		let loads = 0;
		const service = lyricsService({
			get: () => lyrics,
			load: () => {
				loads += 1;
				return Promise.resolve(lyrics);
			},
		});
		const component = driver.renderComponent(
			LyricsModal,
			{ lyricsService: service, onDismiss: () => {}, track },
			undefined,
		);

		const labels = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Label,
		);

		expect(loads).toBe(0);
		expect(labels.map((label) => label.getAttribute('value'))).toContain('a line');
	});

	valdiIt('renders lyrics once the load settles', async (driver) => {
		const component = driver.renderComponent(
			LyricsModal,
			{ lyricsService: lyricsService(), onDismiss: () => {}, track },
			undefined,
		);

		await flush();

		const labels = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Label,
		);

		expect(labels.map((label) => label.getAttribute('value'))).toContain('a line');
	});

	valdiIt('surfaces a failed load rather than reporting no lyrics', async (driver) => {
		const service = lyricsService({ load: () => Promise.reject(new Error('boom')) });
		const component = driver.renderComponent(
			LyricsModal,
			{ lyricsService: service, onDismiss: () => {}, track },
			undefined,
		);

		await flush();

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-modal-panel-failed'),
		).toBeDefined();
		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-modal-panel-empty'),
		).toBeUndefined();
	});

	valdiIt('reports a track the server has no lyrics for', async (driver) => {
		const service = lyricsService({ load: () => Promise.resolve(null) });
		const component = driver.renderComponent(
			LyricsModal,
			{ lyricsService: service, onDismiss: () => {}, track },
			undefined,
		);

		await flush();

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-modal-panel-empty'),
		).toBeDefined();
	});

	valdiIt('dismisses on a backdrop tap', async (driver) => {
		let dismissed = 0;
		const component = driver.renderComponent(
			LyricsModal,
			{
				lyricsService: lyricsService(),
				onDismiss: () => {
					dismissed += 1;
				},
				track,
			},
			undefined,
		);

		component.renderer
			.getComponentRootElements(component, true)
			.find((element) => element.getAttribute('accessibilityLabel') === 'lyrics-modal-backdrop')
			?.getAttribute('onTap')?.(touchEvent);

		expect(dismissed).toBe(1);
	});
});
