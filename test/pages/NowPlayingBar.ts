import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class NowPlayingFooterPage extends BasePage {
	private readonly next: string;
	private readonly previous: string;
	private readonly queueList: string;
	private readonly queueTabBackTo: string;
	private readonly queueTabUpNext: string;
	private readonly togglePlayback: string;
	private readonly bar: string;

	constructor(driver: Browser) {
		super(driver);
		this.next = 'now-playing-next';
		this.previous = 'now-playing-previous';
		this.queueList = 'now-playing-queue-list';
		this.queueTabBackTo = 'now-playing-tab-back-to';
		this.queueTabUpNext = 'now-playing-tab-up-next';
		this.togglePlayback = 'now-playing-play-pause';
		this.bar = 'now-playing-surface-bar';
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

	async openExpandedSurface(): Promise<void> {
		await this.elementByID(this.bar).waitForDisplayed();
		await this.elementByID(this.bar).click();
	}

	async tapPrevious(): Promise<void> {
		await this.elementByID(this.previous).waitForDisplayed();
		await this.elementByID(this.previous).click();
	}

	async tapUpNextTab(): Promise<void> {
		await this.elementByID(this.queueTabUpNext).waitForDisplayed();
		await this.elementByID(this.queueTabUpNext).click();
	}

	async tapBackToTab(): Promise<void> {
		await this.elementByID(this.queueTabBackTo).waitForDisplayed();
		await this.elementByID(this.queueTabBackTo).click();
	}

	async waitForQueueList(): Promise<void> {
		await this.elementByID(this.queueList).waitForDisplayed();
	}
}
