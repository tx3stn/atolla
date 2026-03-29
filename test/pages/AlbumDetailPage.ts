import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class AlbumDetailPage extends BasePage {
	private readonly addToQueueAction: string;
	private readonly contextMenu: string;
	private readonly playAction: string;
	private readonly playNextAction: string;
	private readonly root: string;
	private readonly toast: string;

	constructor(driver: Browser) {
		super(driver);
		this.addToQueueAction = 'track-context-add-to-queue';
		this.contextMenu = 'track-context-menu';
		this.playAction = 'detail-header-play-button';
		this.playNextAction = 'track-context-play-next';
		this.root = 'album-view';
		this.toast = 'toast';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed();
	}

	async tapPlayButton(): Promise<void> {
		await this.elementByID(this.playAction).waitForDisplayed();
		await this.elementByID(this.playAction).click();
	}

	async openTrackContextMenuOnFirstVisibleRow(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix('track-row-');
		await this.elementByID(this.contextMenu).waitForDisplayed();
	}

	async tapTrackAddToQueueAction(): Promise<void> {
		await this.elementByID(this.addToQueueAction).waitForDisplayed();
		await this.elementByID(this.addToQueueAction).click();
	}

	async tapTrackPlayNextAction(): Promise<void> {
		await this.elementByID(this.playNextAction).waitForDisplayed();
		await this.elementByID(this.playNextAction).click();
	}

	async waitForToastVisible(): Promise<void> {
		await this.elementByID(this.toast).waitForDisplayed();
	}
}
