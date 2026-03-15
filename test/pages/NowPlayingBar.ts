import type { Browser } from 'webdriverio';

export class NowPlayingFooterPage {
	constructor(private readonly driver: Browser) {}

	async waitForVisible(): Promise<void> {
		const bar = await this.driver.$('~now-playing-bar');
		await bar.waitForExist({ timeout: 15_000 });
	}

	async tapTogglePlayback(): Promise<void> {
		const toggle = await this.driver.$('~now-playing-toggle');
		await toggle.waitForExist({ timeout: 15_000 });
		await toggle.click();
	}

	async tapNext(): Promise<void> {
		const next = await this.driver.$('~now-playing-next');
		await next.waitForExist({ timeout: 15_000 });
		await next.click();
	}

	async tapSummaryArea(): Promise<void> {
		const summary = await this.driver.$('~now-playing-summary');
		await summary.waitForExist({ timeout: 15_000 });
		await summary.click();
	}
}
