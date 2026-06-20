import 'jasmine/src/jasmine';
import type { ClearCacheSelection } from 'atolla/src/services/ImageCache';
import { CacheClearModal } from 'atolla/src/ui/components/CacheClearModal';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';
import { renderedElements } from './renderedElements';

describe('CacheClearModal', () => {
	valdiIt('renders title and all cache type rows', async (driver) => {
		const viewModel = {
			counts: {
				albumArt: 0,
				albumArtBlurred: 0,
				artistImage: 0,
				artistLogo: 0,
				genreImage: 0,
				playlistImage: 0,
				tracks: 0,
				waveformData: 0,
			},
			onCancel: () => {},
			onConfirm: () => {},
		};
		const component = driver.renderComponent(CacheClearModal, viewModel, undefined);

		const labels = elementTypeFind(renderedElements(component), IRenderedElementViewClass.Label);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('CLEAR CACHE');
		expect(values).toContain('[ 0 ] artist images');
		expect(values).toContain('[ 0 ] artist logos');
		expect(values).toContain('[ 0 ] album art');
		expect(values).toContain('[ 0 ] blurred album art');
		expect(values).toContain('[ 0 ] playlist images');
		expect(values).toContain('[ 0 ] genre images');
		expect(values).toContain('[ 0 ] tracks');
		expect(values).toContain('[ 0 ] waveforms');
	});

	valdiIt(
		'confirm button is enabled when all checkboxes are checked by default',
		async (driver) => {
			const viewModel = {
				counts: {
					albumArt: 0,
					albumArtBlurred: 0,
					artistImage: 0,
					artistLogo: 0,
					genreImage: 0,
					playlistImage: 0,
					tracks: 0,
					waveformData: 0,
				},
				onCancel: () => {},
				onConfirm: () => {},
			};
			const component = driver.renderComponent(CacheClearModal, viewModel, undefined);

			const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
			const confirmBtn = views.find(
				(v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn',
			);

			expect(typeof confirmBtn?.getAttribute('onTap')).toBe('function');
		},
	);

	valdiIt('confirm button is disabled when all checkboxes are unchecked', async (driver) => {
		const viewModel = {
			counts: {
				albumArt: 0,
				albumArtBlurred: 0,
				artistImage: 0,
				artistLogo: 0,
				genreImage: 0,
				playlistImage: 0,
				tracks: 0,
				waveformData: 0,
			},
			onCancel: () => {},
			onConfirm: () => {},
		};
		const component = driver.renderComponent(CacheClearModal, viewModel, undefined);

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-artist-image-row')
			?.getAttribute('onTap')?.(touchEvent);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-artist-logo-row')
			?.getAttribute('onTap')?.(touchEvent);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-album-art-row')
			?.getAttribute('onTap')?.(touchEvent);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-album-art-blurred-row')
			?.getAttribute('onTap')?.(touchEvent);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-playlist-image-row')
			?.getAttribute('onTap')?.(touchEvent);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-genre-image-row')
			?.getAttribute('onTap')?.(touchEvent);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-track-row')
			?.getAttribute('onTap')?.(touchEvent);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-waveform-data-row')
			?.getAttribute('onTap')?.(touchEvent);

		const updatedViews = elementTypeFind(
			renderedElements(component),
			IRenderedElementViewClass.View,
		);
		const confirmBtn = updatedViews.find(
			(v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn',
		);

		expect(confirmBtn?.getAttribute('onTap')).toBeUndefined();
	});

	valdiIt('calls onConfirm with full selection when confirmed with defaults', async (driver) => {
		let received: unknown;
		const viewModel = {
			counts: {
				albumArt: 0,
				albumArtBlurred: 0,
				artistImage: 0,
				artistLogo: 0,
				genreImage: 0,
				playlistImage: 0,
				tracks: 0,
				waveformData: 0,
			},
			onCancel: () => {},
			onConfirm: (selection: ClearCacheSelection) => {
				received = selection;
			},
		};
		const component = driver.renderComponent(CacheClearModal, viewModel, undefined);

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(received).toEqual({
			albumArt: true,
			albumArtBlurred: true,
			artistImage: true,
			artistLogo: true,
			genreImage: true,
			playlistImage: true,
			tracks: true,
			waveformData: true,
		});
	});

	valdiIt('calls onConfirm reflecting unchecked items', async (driver) => {
		let received: unknown;
		const viewModel = {
			counts: {
				albumArt: 0,
				albumArtBlurred: 0,
				artistImage: 0,
				artistLogo: 0,
				genreImage: 0,
				playlistImage: 0,
				tracks: 0,
				waveformData: 0,
			},
			onCancel: () => {},
			onConfirm: (selection: ClearCacheSelection) => {
				received = selection;
			},
		};
		const component = driver.renderComponent(CacheClearModal, viewModel, undefined);

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-album-art-row')
			?.getAttribute('onTap')?.(touchEvent);

		const updatedViews = elementTypeFind(
			renderedElements(component),
			IRenderedElementViewClass.View,
		);
		updatedViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(received).toEqual({
			albumArt: false,
			albumArtBlurred: true,
			artistImage: true,
			artistLogo: true,
			genreImage: true,
			playlistImage: true,
			tracks: true,
			waveformData: true,
		});
	});

	valdiIt('calls onCancel when cancel button is tapped', async (driver) => {
		let cancelled = false;
		const viewModel = {
			counts: {
				albumArt: 0,
				albumArtBlurred: 0,
				artistImage: 0,
				artistLogo: 0,
				genreImage: 0,
				playlistImage: 0,
				tracks: 0,
				waveformData: 0,
			},
			onCancel: () => {
				cancelled = true;
			},
			onConfirm: () => {},
		};
		const component = driver.renderComponent(CacheClearModal, viewModel, undefined);

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-cancel-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(cancelled).toBe(true);
	});
});
