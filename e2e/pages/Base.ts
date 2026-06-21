import type { Browser, ChainablePromiseElement } from 'webdriverio';

export class BasePage {
	constructor(protected readonly driver: Browser) {}

	public isIOS(): boolean {
		return (this.driver.capabilities.platformName as string).toLowerCase() === 'ios';
	}

	protected isAndroid(): boolean {
		return !this.isIOS();
	}

	public elementByID(id: string): ChainablePromiseElement {
		return this.driver.$(`~${id}`);
	}

	public async allByAccessibilityPrefix(prefix: string): Promise<Array<WebdriverIO.Element>> {
		const selector = this.isAndroid()
			? `android=new UiSelector().descriptionStartsWith("${prefix}")`
			: `//*[starts-with(@name, "${prefix}")]`;
		const elements: Array<WebdriverIO.Element> = [];
		for await (const el of this.driver.$$(selector)) {
			elements.push(el);
		}
		return elements;
	}

	public async allByAccessibilityPrefixWithin(
		container: ChainablePromiseElement,
		prefix: string,
	): Promise<Array<WebdriverIO.Element>> {
		const elements: Array<WebdriverIO.Element> = [];
		if (this.isAndroid()) {
			for await (const el of container.$$(
				`android=new UiSelector().descriptionStartsWith("${prefix}")`,
			)) {
				elements.push(el);
			}
		} else {
			for await (const el of container.$$(`.//*[starts-with(@name, "${prefix}")]`)) {
				elements.push(el);
			}
		}
		return elements;
	}

	public async waitForVisibleAccessibilityPrefix(prefix: string): Promise<void> {
		await this.driver.waitUntil(
			async () => {
				for await (const element of this.driver.$$(
					`//*[starts-with(@name, "${prefix}") or starts-with(@content-desc, "${prefix}")]`,
				)) {
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

		for await (const element of this.driver.$$(
			`//*[starts-with(@name, "${prefix}") or starts-with(@content-desc, "${prefix}")]`,
		)) {
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
		// ChainablePromiseElement is a runtime thenable but TS doesn't type it as Promise
		const resolvedElement = await (element as unknown as Promise<WebdriverIO.Element>);
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
		try {
			if (this.isAndroid()) {
				await this.driver.waitUntil(
					async () => this.driver.$('android=new UiSelector().text("Allow")').isExisting(),
					{ timeout: 2_000, timeoutMsg: '' },
				);
				await this.driver.$('android=new UiSelector().text("Allow")').click();
			} else {
			}
		} catch {}
	}

	public async sortedByY(
		elements: Array<WebdriverIO.Element>,
	): Promise<Array<WebdriverIO.Element>> {
		const positioned = await Promise.all(
			elements.map(async (element) => ({ element, y: (await element.getLocation()).y })),
		);
		return positioned.sort((a, b) => a.y - b.y).map((entry) => entry.element);
	}

	// handles must be the drag handles sorted top-to-bottom
	public async dragFirstHandleBelowSecond(handles: Array<WebdriverIO.Element>): Promise<void> {
		if (handles.length < 2) {
			throw new Error('Need at least two rows to reorder');
		}

		const startLocation = await handles[0].getLocation();
		const startSize = await handles[0].getSize();
		const secondLocation = await handles[1].getLocation();
		const x = Math.floor(startLocation.x + startSize.width / 2);
		const startY = Math.floor(startLocation.y + startSize.height / 2);
		const rowGap = Math.max(1, Math.floor(secondLocation.y - startLocation.y));

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: startY },
					{ button: 0, type: 'pointerDown' },
					{ duration: 300, type: 'pause' },
					{ duration: 250, type: 'pointerMove', x, y: startY + Math.floor(rowGap * 0.6) },
					{ duration: 250, type: 'pointerMove', x, y: startY + Math.floor(rowGap * 1.2) },
					{ duration: 150, type: 'pause' },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'reorder-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}

	public async swipeBack(): Promise<void> {
		const rect = await this.driver.getWindowRect();
		if (this.isIOS()) {
			await this.driver.execute('mobile: dragFromToForDuration', {
				duration: 0.4,
				fromX: 2,
				fromY: Math.floor(rect.height * 0.5),
				toX: Math.floor(rect.width * 0.75),
				toY: Math.floor(rect.height * 0.5),
			});
		} else {
			const y = Math.floor(rect.height * 0.45);
			await this.driver.performActions([
				{
					actions: [
						{ duration: 0, type: 'pointerMove', x: Math.floor(rect.width * 0.02), y },
						{ button: 0, type: 'pointerDown' },
						{ duration: 100, type: 'pause' },
						{ duration: 250, type: 'pointerMove', x: Math.floor(rect.width * 0.7), y },
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
}
