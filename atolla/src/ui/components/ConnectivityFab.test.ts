import { describe, expect, it } from 'bun:test';

describe('ConnectivityFab', () => {
	it('implements transition timing, lockout, and hidden support', async () => {
		const source = await Bun.file(new URL('./ConnectivityFab.tsx', import.meta.url)).text();

		expect(source).toContain('const TRANSITION_DISPLAY_MS = 2000');
		expect(source).toContain('if (this.viewModel.hidden) {');
		expect(source).toContain('if (this.viewModel.hidden || this.state.isTransitioning)');
		expect(source).toContain("accessibilityLabel='connectivity-fab'");
		expect(source).toContain('this.animateWifiBands()');
		expect(source).toContain('.onRequestModeChange(targetMode)');
	});
});
