import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class NowPlayingFooterPage extends BasePage {
	private readonly next: string;
	private readonly summary: string;
	private readonly togglePlayback: string;
	private readonly bar: string;

	constructor(driver: Browser) {
		super(driver);
		this.next = 'now-playing-next';
		this.summary = 'now-playing-summary';
		this.togglePlayback = 'now-playing-toggle';
		this.bar = 'now-playing-bar';
	}

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.bar).waitForDisplayed();
	}

	async tapTogglePlayback(): Promise<void> {
		await this.elementByID(this.togglePlayback).waitForDisplayed();
		await this.elementByID(this.togglePlayback).click();
	}

	async tapNext(): Promise<void> {
		await this.elementByID(this.next).waitForDisplayed();
		await this.elementByID(this.next).click();
	}

	async tapSummaryArea(): Promise<void> {
		await this.elementByID(this.summary).waitForDisplayed();
		await this.elementByID(this.summary).click();
	}
}
