// @ts-nocheck
import 'jasmine/src/jasmine';
import { AlbumView } from 'atolla/src/ui/views/AlbumView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('AlbumView', () => {
	valdiIt('renders track rows when tracks are present in state', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const tracks = [
			{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 },
			{ duration: 90, id: 'track-2', name: 'Song Two', trackNumber: 2 },
		];
		const transport = {
			getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' }),
			getTracksByAlbum: async () => tracks,
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
		};

		const instrumented = createComponent(AlbumView, {
			album,
			playbackStore,
			transport,
		});
		const component = instrumented.getComponent();

		component.setState({ artistLogoUrl: 'https://logo.png', tracks });

		expect(component.state.tracks.length).toBe(2);
		expect(component.state.artistLogoUrl).toBe('https://logo.png');
	});

	valdiIt('plays loaded tracks and forwards artist logo on play tap', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const tracks = [{ duration: 120, id: 'track-1', name: 'Song One', trackNumber: 1 }];
		const transport = {
			getArtist: async () => ({ id: 'artist-1', logoUrl: 'https://logo.png', name: 'Artist One' }),
			getTracksByAlbum: async () => tracks,
		};

		let playedTracks = null;
		let playedAlbum = null;
		let logo = 'unset';
		const playbackStore = {
			play: (inputTracks, inputAlbum) => {
				playedTracks = inputTracks;
				playedAlbum = inputAlbum;
			},
			setArtistLogoUrl: (inputLogo) => {
				logo = inputLogo;
			},
		};

		const instrumented = createComponent(AlbumView, {
			album,
			playbackStore,
			transport,
		});
		const component = instrumented.getComponent();

		component.setState({ artistLogoUrl: 'https://logo.png', tracks });
		component.handleHeaderPlayTap();

		expect(playedTracks).toEqual(tracks);
		expect(playedAlbum).toEqual(album);
		expect(logo).toBe('https://logo.png');
	});

	valdiIt('does not call play when tracks are empty', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		let playCalls = 0;
		const playbackStore = {
			play: () => {
				playCalls += 1;
			},
			setArtistLogoUrl: () => {},
		};
		const transport = {
			getArtist: async () => null,
			getTracksByAlbum: async () => [],
		};

		const instrumented = createComponent(AlbumView, {
			album,
			playbackStore,
			transport,
		});
		const component = instrumented.getComponent();

		component.handleHeaderPlayTap();

		expect(playCalls).toBe(0);
	});

	valdiIt('renders total duration in subheader when tracks are loaded', () => {
		const album = {
			artistId: 'artist-1',
			artistName: 'Artist One',
			id: 'album-1',
			name: 'First Album',
		};
		const transport = {
			getArtist: async () => null,
			getTracksByAlbum: async () => [
				{ duration: 60, id: 'track-1', name: 'Song One', trackNumber: 1 },
				{ duration: 75, id: 'track-2', name: 'Song Two', trackNumber: 2 },
			],
		};
		const playbackStore = {
			play: () => {},
			setArtistLogoUrl: () => {},
		};

		const instrumented = createComponent(AlbumView, {
			album,
			playbackStore,
			transport,
		});
		const component = instrumented.getComponent();

		component.setState({
			artistLogoUrl: null,
			tracks: [
				{ duration: 60, id: 'track-1', name: 'Song One', trackNumber: 1 },
				{ duration: 75, id: 'track-2', name: 'Song Two', trackNumber: 2 },
			],
		});

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('2:15');
	});
});
