import { BasePage, type PlatformLocator } from './Base';

export class ConnectionPage extends BasePage {
	private readonly locators = {
		connectButton: {
			android: '~connection-connect-btn',
			// Button component appends "-btn"; on iOS find the StaticText "connect" and tap its parent view
			ios: '//XCUIElementTypeStaticText[@name="connect"]/..',
		},
		footer: {
			android: '~footer-home',
			ios: '//XCUIElementTypeImage[@name="home"]/..',
		},
		serverUrlInput: {
			android: '~connection-server-url-input',
			ios: '//XCUIElementTypeTextField',
		},
	} satisfies Record<string, PlatformLocator>;

	async isVisible(): Promise<boolean> {
		const el = this.element(this.locators.serverUrlInput);
		if (!(await el.isExisting())) {
			return false;
		}
		return el.isDisplayed();
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.serverUrlInput).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for connection view',
		});
	}

	async connectToMock(): Promise<void> {
		await this.element(this.locators.serverUrlInput).waitForDisplayed();
		await this.element(this.locators.serverUrlInput).setValue('mock');
		await this.element(this.locators.connectButton).waitForDisplayed();
		await this.element(this.locators.connectButton).click();
		await this.element(this.locators.footer).waitForDisplayed({
			timeout: 30_000,
			timeoutMsg: 'App did not load main UI after mock connection',
		});
	}
}
