import { describe, expect, it } from 'bun:test';

describe('GenreView', () => {
	it('uses paginated genre tracks and lazy load trigger', async () => {
		const source = await Bun.file(new URL('./GenreView.tsx', import.meta.url)).text();

		expect(source).toContain('getTracksByGenrePage');
		expect(source).toContain("accessibilityLabel='genre-load-more-trigger'");
		expect(source).toContain('totalTrackCount != null');
	});
});
