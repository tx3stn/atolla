import 'jasmine/src/jasmine';
import type { ClearCacheSelection } from 'atolla/src/services/ImageCache';
import { CacheClearModal } from 'atolla/src/ui/components/CacheClearModal';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { renderedElements } from './renderedElements';

describe('CacheClearModal', () => {
	valdiIt('renders title and all cache type rows', async () => {
		const instrumented = createComponent(CacheClearModal, {
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
		});
		const component = instrumented.getComponent();

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

	valdiIt('confirm button is enabled when all checkboxes are checked by default', async () => {
		const instrumented = createComponent(CacheClearModal, {
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
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		const confirmBtn = views.find(
			(v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn',
		);

		expect(typeof confirmBtn?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('confirm button is disabled when all checkboxes are unchecked', async () => {
		const instrumented = createComponent(CacheClearModal, {
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
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-artist-image-row')
			?.getAttribute('onTap')?.();
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-artist-logo-row')
			?.getAttribute('onTap')?.();
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-album-art-row')
			?.getAttribute('onTap')?.();
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-album-art-blurred-row')
			?.getAttribute('onTap')?.();
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-playlist-image-row')
			?.getAttribute('onTap')?.();
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-genre-image-row')
			?.getAttribute('onTap')?.();
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-track-row')
			?.getAttribute('onTap')?.();
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-waveform-data-row')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			renderedElements(component),
			IRenderedElementViewClass.View,
		);
		const confirmBtn = updatedViews.find(
			(v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn',
		);

		expect(confirmBtn?.getAttribute('onTap')).toBeUndefined();
	});

	valdiIt('calls onConfirm with full selection when confirmed with defaults', async () => {
		let received: unknown;
		const instrumented = createComponent(CacheClearModal, {
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
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.();

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

	valdiIt('calls onConfirm reflecting unchecked items', async () => {
		let received: unknown;
		const instrumented = createComponent(CacheClearModal, {
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
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-album-art-row')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			renderedElements(component),
			IRenderedElementViewClass.View,
		);
		updatedViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.();

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

	valdiIt('calls onCancel when cancel button is tapped', async () => {
		let cancelled = false;
		const instrumented = createComponent(CacheClearModal, {
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
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-cancel-btn')
			?.getAttribute('onTap')?.();

		expect(cancelled).toBe(true);
	});
});
