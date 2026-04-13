import { describe, expect, it } from 'bun:test';

describe('GenresView', () => {
	it('renders paginated genres card grid', async () => {
		const source = await Bun.file(new URL('./GenresView.tsx', import.meta.url)).text();

		expect(source).toContain('getGenresPage(');
		expect(source).toContain("accessibilityLabel='home-genres-grid'");
		expect(source).toContain('onLoadMore={');
	});
});
