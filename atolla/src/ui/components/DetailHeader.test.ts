import { describe, expect, it } from 'bun:test';

describe('DetailHeader remove download confirmation', () => {
	it('renders confirmation modal and yes/no actions for remove download', async () => {
		const source = await Bun.file(new URL('./DetailHeader.tsx', import.meta.url)).text();

		expect(source).toContain("modalAccessibilityLabel='detail-header-remove-download-modal'");
		expect(source).toContain("confirmAccessibilityLabel='detail-header-remove-download-yes-btn'");
		expect(source).toContain("cancelAccessibilityLabel='detail-header-remove-download-no-btn'");
		expect(source).toContain("title='REMOVE DOWNLOAD?'");
	});
});
