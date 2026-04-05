import { describe, expect, it } from 'bun:test';

describe('LoadingView', () => {
	it('renders loading label and spinner', async () => {
		const source = await Bun.file(new URL('./LoadingView.tsx', import.meta.url)).text();

		expect(source).toContain("value='loading...'");
		expect(source).toContain('<LoopingArrowSpinner size={24} />');
	});
});
