import type { Browser, ChainablePromiseElement } from 'webdriverio';

export class BasePage {
	constructor(protected readonly driver: Browser) {}

	public elementByID(id: string): ChainablePromiseElement {
		return this.driver.$(`~${id}`);
	}

	public elementByAccessibilityPrefix(prefix: string): ChainablePromiseElement {
		return this.driver.$(
			`//*[starts-with(@name, "${prefix}") or starts-with(@content-desc, "${prefix}")]`,
		);
	}

	public async waitForVisibleAccessibilityPrefix(prefix: string): Promise<void> {
		await this.driver.waitUntil(
			async () => {
				const elements = await this.driver.$$(
					`//*[starts-with(@name, "${prefix}") or starts-with(@content-desc, "${prefix}")]`,
				);

				for (const element of elements) {
					if (await element.isDisplayed()) {
						return true;
					}
				}

				return false;
			},
			{ timeoutMsg: `Timed out waiting for visible accessibility prefix: ${prefix}` },
		);
	}

	public async firstVisibleByAccessibilityPrefix(prefix: string): Promise<WebdriverIO.Element> {
		await this.waitForVisibleAccessibilityPrefix(prefix);
		const elements = await this.driver.$$(
			`//*[starts-with(@name, "${prefix}") or starts-with(@content-desc, "${prefix}")]`,
		);

		for (const element of elements) {
			if (await element.isDisplayed()) {
				return element;
			}
		}

		throw new Error(`No visible elements found for accessibility prefix: ${prefix}`);
	}

	public async tapFirstVisibleByAccessibilityPrefix(prefix: string): Promise<void> {
		const element = await this.firstVisibleByAccessibilityPrefix(prefix);
		await element.click();
	}

	public async longPressElement(
		element: ChainablePromiseElement | WebdriverIO.Element,
		durationMs = 800,
	): Promise<void> {
		const resolvedElement = (await element) as WebdriverIO.Element;
		await resolvedElement.waitForDisplayed();
		const location = await resolvedElement.getLocation();
		const size = await resolvedElement.getSize();
		const centerX = Math.floor(location.x + size.width / 2);
		const centerY = Math.floor(location.y + size.height / 2);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x: centerX, y: centerY },
					{ button: 0, type: 'pointerDown' },
					{ duration: durationMs, type: 'pause' },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'long-press-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}

	public async longPressFirstVisibleByAccessibilityPrefix(
		prefix: string,
		durationMs = 800,
	): Promise<void> {
		const element = await this.firstVisibleByAccessibilityPrefix(prefix);
		await this.longPressElement(element, durationMs);
	}

	protected async dismissPermissionDialogIfPresent(): Promise<void> {
		const isAndroid = (this.driver.capabilities.platformName as string).toLowerCase() === 'android';
		try {
			if (isAndroid) {
				await this.driver.waitUntil(
					async () => this.driver.$('android=new UiSelector().text("Allow")').isExisting(),
					{ timeout: 2_000, timeoutMsg: '' },
				);
				await this.driver.$('android=new UiSelector().text("Allow")').click();
			} else {
				await this.driver.acceptAlert();
			}
		} catch {
			// No permission dialog present
		}
	}

	public async swipeBack(): Promise<void> {
		const rect = await this.driver.getWindowRect();
		const y = Math.floor(rect.height * 0.45);
		const startX = Math.floor(rect.width * 0.02);
		const endX = Math.floor(rect.width * 0.7);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x: startX, y },
					{ button: 0, type: 'pointerDown' },
					{ duration: 100, type: 'pause' },
					{ duration: 250, type: 'pointerMove', x: endX, y },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'swipe-back-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}
}
