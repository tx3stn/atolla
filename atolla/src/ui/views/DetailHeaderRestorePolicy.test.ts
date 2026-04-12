import { describe, expect, it } from 'bun:test';

describe('Detail view home-header restore policy', () => {
	it('restores header on destroy only when restoreHeaderOnDestroy is enabled', async () => {
		const albumSource = await Bun.file(new URL('./AlbumView.tsx', import.meta.url)).text();
		const artistSource = await Bun.file(new URL('./ArtistView.tsx', import.meta.url)).text();
		const playlistSource = await Bun.file(new URL('./PlaylistView.tsx', import.meta.url)).text();

		expect(albumSource).toContain('restoreHeaderOnDestroy?: boolean;');
		expect(albumSource).toContain('if (this.viewModel.restoreHeaderOnDestroy ?? true)');
		expect(albumSource).toContain('this.viewModel.onHeaderVisibilityChange?.(true);');

		expect(artistSource).toContain('restoreHeaderOnDestroy?: boolean;');
		expect(artistSource).toContain('if (this.viewModel.restoreHeaderOnDestroy ?? true)');
		expect(artistSource).toContain('this.viewModel.onHeaderVisibilityChange?.(true);');

		expect(playlistSource).toContain('restoreHeaderOnDestroy?: boolean;');
		expect(playlistSource).toContain('if (this.viewModel.restoreHeaderOnDestroy ?? true)');
		expect(playlistSource).toContain('this.viewModel.onHeaderVisibilityChange?.(true);');
	});

	it('disables header restore for detail-to-detail pushes', async () => {
		const albumSource = await Bun.file(new URL('./AlbumView.tsx', import.meta.url)).text();
		const artistSource = await Bun.file(new URL('./ArtistView.tsx', import.meta.url)).text();
		const playlistSource = await Bun.file(new URL('./PlaylistView.tsx', import.meta.url)).text();

		expect(albumSource).toContain('restoreHeaderOnDestroy: false,');
		expect(artistSource).toContain('restoreHeaderOnDestroy: false,');
		expect(playlistSource).toContain('restoreHeaderOnDestroy: false,');
	});
});
