import { describe, expect, it } from 'bun:test';

describe('LibraryHeaderNav', () => {
	it('renders scrollable tab row with artists, albums, genres, and playlists', async () => {
		const source = await Bun.file(new URL('./LibraryHeaderNav.tsx', import.meta.url)).text();

		expect(source).toContain("accessibilityLabel='library-header-nav'");
		expect(source).toContain(
			'<scroll horizontal={true} showsHorizontalScrollIndicator={false} style={styles.scroll}>',
		);
		expect(source).toContain('<ConnectivityFab');
		expect(source).toContain('style={styles.leadingFabSlot}');
		expect(source).toContain('style={styles.tabsRow}');
		expect(source).toContain("value='>'");
		expect(source).toContain('tab={HeaderTabs.artists}');
		expect(source).toContain('tab={HeaderTabs.albums}');
		expect(source).toContain('tab={HeaderTabs.playlists}');
		expect(source).toContain('tab={HeaderTabs.genres}');
	});
});
