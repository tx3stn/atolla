import { describe, expect, it } from 'bun:test';

describe('HomeView', () => {
	it('renders connectivity fab and requested home sections', async () => {
		const source = await Bun.file(new URL('./HomeView.tsx', import.meta.url)).text();

		expect(source).toContain("accessibilityLabel='home-view'");
		expect(source).toContain('<ConnectivityFab');
		expect(source).toContain("value='ON THIS DAY'");
		expect(source).toContain("accessibilityLabel='home-on-this-day-grid'");
		expect(source).toContain("value='RECENTLY ADDED'");
		expect(source).toContain("accessibilityLabel='home-recently-added-grid'");
		expect(source).toContain("value='RECENTLY PLAYED'");
		expect(source).toContain('recentlyPlayedTracks: Array<Track>');
		expect(source).toContain('this.viewModel.recentlyPlayedTracks.slice(0, 5)');
		expect(source).toContain('Math.max(1, this.viewModel.gridColumns) * 2');
	});
});
