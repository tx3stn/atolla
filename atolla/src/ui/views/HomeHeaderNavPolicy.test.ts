import { describe, expect, it } from 'bun:test';

describe('Home header nav visibility policy', () => {
	it('keeps home root tabs pinned below a visible header nav', async () => {
		const albumsSource = await Bun.file(new URL('./AlbumsView.tsx', import.meta.url)).text();
		const artistsSource = await Bun.file(new URL('./ArtistsView.tsx', import.meta.url)).text();
		const playlistsSource = await Bun.file(new URL('./PlaylistsView.tsx', import.meta.url)).text();
		const genresSource = await Bun.file(new URL('./GenresView.tsx', import.meta.url)).text();

		expect(albumsSource).toContain('paddingTop: theme.headerHeight,');
		expect(artistsSource).toContain('paddingTop: theme.headerHeight,');
		expect(playlistsSource).toContain('paddingTop: theme.headerHeight,');
		expect(genresSource).toContain('paddingTop: theme.headerHeight,');
	});

	it('hides home header only when entering detail routes from root tabs', async () => {
		const albumsSource = await Bun.file(new URL('./AlbumsView.tsx', import.meta.url)).text();
		const artistsSource = await Bun.file(new URL('./ArtistsView.tsx', import.meta.url)).text();
		const playlistsSource = await Bun.file(new URL('./PlaylistsView.tsx', import.meta.url)).text();

		expect(albumsSource).toContain('this.viewModel.onHeaderVisibilityChange?.(false);');
		expect(artistsSource).toContain('this.viewModel.onHeaderVisibilityChange?.(false);');
		expect(playlistsSource).toContain('this.viewModel.onHeaderVisibilityChange?.(false);');
	});

	it('does not include scroll gesture-driven header toggling in genres root tab', async () => {
		const genresSource = await Bun.file(new URL('./GenresView.tsx', import.meta.url)).text();

		expect(genresSource).not.toContain('createHeaderVisibilityTouchHandler');
		expect(genresSource).not.toContain('onDragPredicate');
		expect(genresSource).not.toContain('onDrag={');
	});
});
