import type { Browser, ChainablePromiseElement } from 'webdriverio';

export class BasePage {
	protected readonly anyCardPrefix = 'card-';
	private readonly cardTitlePrefix = 'grid-card-title-';
	private readonly anyTrackTitlePrefix = 'track-title-';
	private readonly anyTrackRowPrefix = 'track-row-';
	private readonly appHeader = 'app-header';
	protected readonly footerHome = 'footer-home';

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

	// android builds content-desc by joining label, hint and value, so a field holding text stops
	// matching its accessibility id exactly. iOS exposes the identifier as name, untouched by value
	public elementByIDWithValue(id: string): ChainablePromiseElement {
		return this.isAndroid()
			? this.driver.$(`android=new UiSelector().descriptionStartsWith("${id}")`)
			: this.driver.$(`~${id}`);
	}

	public async allByAccessibilityPrefix(prefix: string): Promise<Array<WebdriverIO.Element>> {
		const selector = this.isAndroid()
			? `android=new UiSelector().descriptionStartsWith("${prefix}")`
			: `-ios predicate string:name BEGINSWITH "${prefix}"`;
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
			for await (const el of container.$$(`-ios predicate string:name BEGINSWITH "${prefix}"`)) {
				elements.push(el);
			}
		}
		return elements;
	}

	public async visibleCardIDs(): Promise<Array<string>> {
		const attribute = this.isIOS() ? 'name' : 'content-desc';
		const ids: Array<string> = [];
		for (const el of await this.allByAccessibilityPrefix(this.anyCardPrefix)) {
			const id = (await el.getAttribute(attribute)) ?? '';
			if (id.startsWith(this.anyCardPrefix)) {
				ids.push(id);
			}
		}
		return ids;
	}

	public async waitForVisibleAccessibilityPrefix(prefix: string): Promise<void> {
		await this.firstVisibleByAccessibilityPrefix(prefix);
	}

	public async firstVisibleByAccessibilityPrefix(prefix: string): Promise<WebdriverIO.Element> {
		let visible: WebdriverIO.Element | undefined;
		await this.driver.waitUntil(
			async () => {
				for (const element of await this.allByAccessibilityPrefix(prefix)) {
					if (await element.isDisplayed()) {
						visible = element;
						return true;
					}
				}
				return false;
			},
			{ timeoutMsg: `Timed out waiting for visible accessibility prefix: ${prefix}` },
		);

		if (!visible) {
			throw new Error(`No visible elements found for accessibility prefix: ${prefix}`);
		}
		return visible;
	}

	public async tapFirstVisibleByAccessibilityPrefix(prefix: string): Promise<void> {
		const element = await this.firstVisibleByAccessibilityPrefix(prefix);
		await element.click();
	}

	public async tapCardByTitle(title: string, maxSteps = 20): Promise<void> {
		await this.tapByTitle(title, this.cardTitlePrefix, this.anyCardPrefix, maxSteps, 'card');
	}

	public async tapTrackByTitle(title: string, maxSteps = 20): Promise<void> {
		await this.tapByTitle(
			title,
			this.anyTrackTitlePrefix,
			this.anyTrackRowPrefix,
			maxSteps,
			'track',
		);
	}

	// steps creep rather than fling so a whole screen of rows can't slip by between checks, since
	// only what is on screen is queryable. this searches downwards from wherever the list already
	// is, so callers open the list fresh rather than reusing one somebody left scrolled
	private async tapByTitle(
		title: string,
		titlePrefix: string,
		targetPrefix: string,
		maxSteps: number,
		subject: string,
	): Promise<void> {
		for (let step = 0; step <= maxSteps; step += 1) {
			const id = await this.idByTitle(title, titlePrefix);
			if (id) {
				const element = await this.scrollUntilDisplayed(`${targetPrefix}${id}`);
				await element.click();
				return;
			}
			await this.creepDown();
		}
		throw new Error(`No ${subject} titled "${title}" found after ${maxSteps} steps`);
	}

	// matching the title text directly keeps this to one query per step: reading every row's title
	// instead costs a round trip per row, which is minutes on a full library grid
	private async idByTitle(title: string, titlePrefix: string): Promise<string | undefined> {
		const selector = this.isAndroid()
			? `android=new UiSelector().text(${JSON.stringify(title)})`
			: `-ios predicate string:value == ${JSON.stringify(title)}`;

		for await (const element of this.driver.$$(selector)) {
			const id = await this.titleIDOf(element, titlePrefix);
			if (id) return id;
		}
		return undefined;
	}

	// the same text also appears on genre pills and detail headers, so the accessibility id is what
	// confirms a match is the title we mean. android appends the element's value to content-desc
	private async titleIDOf(
		element: WebdriverIO.Element,
		titlePrefix: string,
	): Promise<string | undefined> {
		try {
			const attribute = this.isIOS() ? 'name' : 'content-desc';
			const value = (await element.getAttribute(attribute)) ?? '';
			if (!value.startsWith(titlePrefix)) return undefined;
			return value.slice(titlePrefix.length).split(/[\s,]/)[0];
		} catch {
			return undefined;
		}
	}

	public async longPressElement(
		element: ChainablePromiseElement | WebdriverIO.Element,
		durationMs = 800,
	): Promise<void> {
		// ChainablePromiseElement is a runtime thenable but TS doesn't type it as Promise
		const resolvedElement = await (element as unknown as Promise<WebdriverIO.Element>);
		await resolvedElement.waitForDisplayed();
		const rect = { ...(await resolvedElement.getLocation()), ...(await resolvedElement.getSize()) };
		const centerX = Math.floor(rect.x + rect.width / 2);
		const centerY = Math.floor(rect.y + rect.height / 2);

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

	public async scrollIntoTappableArea(
		element: ChainablePromiseElement,
		maxSteps = 6,
	): Promise<void> {
		const header = this.elementByID(this.appHeader);
		const headerBottom = (await header.getLocation('y')) + (await header.getSize('height'));
		const footerTop = await this.elementByID(this.footerHome).getLocation('y');
		for (let step = 0; step < maxSteps; step += 1) {
			const rect = { ...(await element.getLocation()), ...(await element.getSize()) };
			if (rect.y < headerBottom) {
				await this.creepUp();
			} else if (rect.y + rect.height > footerTop) {
				await this.creepDown();
			} else {
				return;
			}
		}
		throw new Error('Element never scrolled clear of the header and footer nav');
	}

	public async longPressFirstVisibleByAccessibilityPrefix(
		prefix: string,
		durationMs = 800,
	): Promise<void> {
		const element = await this.firstVisibleByAccessibilityPrefix(prefix);
		await this.longPressElement(element, durationMs);
	}

	// grids paginate/scroll, so a specific card by id may sit below the fold or on a page that
	// hasn't loaded yet; scroll down repeatedly until it's actually on screen.
	public async scrollUntilDisplayed(id: string, maxAttempts = 8): Promise<ChainablePromiseElement> {
		const element = this.elementByID(id);
		for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
			if (await this.isWithinScreenBounds(element)) {
				return element;
			}
			await this.scrollDown();
			// on Android, a long-press started while the list is still settling from scroll
			// momentum gets read as a drag and cancelled instead of opening the context menu
			await this.driver.pause(300);
		}
		return element;
	}

	// Android's isDisplayed() can report true for a RecyclerView item that's attached to the
	// hierarchy but still below the visible viewport, so cross-check its actual bounds too
	private async isWithinScreenBounds(element: ChainablePromiseElement): Promise<boolean> {
		try {
			if (!(await element.isDisplayed())) {
				return false;
			}
			const { height } = await this.driver.getWindowSize();
			const rect = { ...(await element.getLocation()), ...(await element.getSize()) };
			return rect.y >= 0 && rect.y + rect.height <= height;
		} catch {
			return false;
		}
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

	// which attribute carries an element's text differs by platform, and asking for the other
	// platform's attribute is an error rather than an empty answer: iOS surfaces a label's content
	// as `value` (its `label` holds the accessibility label, which for our labels is the
	// accessibility id), Android exposes it as text. anything starting with ignorePrefix is an
	// accessibility id leaking through rather than real content
	public async readElementText(
		element: WebdriverIO.Element,
		ignorePrefix?: string,
	): Promise<string> {
		const reads = this.isAndroid()
			? [() => element.getText()]
			: [() => element.getAttribute('value'), () => element.getText()];

		for (const read of reads) {
			try {
				const text = await read();
				if (text && !(ignorePrefix && text.startsWith(ignorePrefix))) {
					return text;
				}
			} catch {
				// element type doesn't carry this attribute
			}
		}
		return '';
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

		const start = { ...(await handles[0].getLocation()), ...(await handles[0].getSize()) };
		const second = { ...(await handles[1].getLocation()), ...(await handles[1].getSize()) };
		const x = Math.floor(start.x + start.width / 2);
		const startY = Math.floor(start.y + start.height / 2);
		const rowGap = Math.max(1, Math.floor(second.y - start.y));

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

	// swipe the content up to reveal what sits below the fold
	public async scrollDown(): Promise<void> {
		await this.verticalSwipe('scroll-down-finger', 0.75, 0.3);
	}

	// a flung scroll coasts well past where the finger lifted, skipping whole screens of rows.
	// moving a shorter distance slowly and holding still before release lifts at zero velocity,
	// so the list stops where it was put
	public async creepDown(): Promise<void> {
		await this.verticalSwipe('creep-down-finger', 0.7, 0.4, 600, 250);
	}

	public async creepUp(): Promise<void> {
		await this.verticalSwipe('creep-up-finger', 0.4, 0.7, 600, 250);
	}

	private async verticalSwipe(
		id: string,
		fromRatio: number,
		toRatio: number,
		moveMs = 260,
		settleMs = 0,
	): Promise<void> {
		const rect = await this.driver.getWindowRect();
		const x = Math.floor(rect.width * 0.5);
		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: Math.floor(rect.height * fromRatio) },
					{ button: 0, type: 'pointerDown' },
					{ duration: 40, type: 'pause' },
					{ duration: moveMs, type: 'pointerMove', x, y: Math.floor(rect.height * toRatio) },
					...(settleMs > 0 ? [{ duration: settleMs, type: 'pause' }] : []),
					{ button: 0, type: 'pointerUp' },
				],
				id,
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
