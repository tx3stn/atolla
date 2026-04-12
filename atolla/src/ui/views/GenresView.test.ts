import { describe, expect, it } from 'bun:test';

describe('GenresView', () => {
	it('renders genres placeholder content', async () => {
		const source = await Bun.file(new URL('./GenresView.tsx', import.meta.url)).text();

		expect(source).toContain("value='Genres'");
		expect(source).toContain("value='Coming soon.'");
	});
});
