import { BasePage } from './Base';

export class LyricsModal extends BasePage {
	private readonly root = 'lyrics-modal';
	private readonly linePrefix = 'lyrics-modal-panel-line-';
	private readonly empty = 'lyrics-modal-panel-empty';

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Lyrics modal not visible',
		});
	}

	async isDisplayed(): Promise<boolean> {
		const el = this.elementByID(this.root);
		return (await el.isExisting()) && (await el.isDisplayed());
	}

	async showsEmptyState(): Promise<boolean> {
		return await this.elementByID(this.empty).isExisting();
	}

	// only the lines currently scrolled into view are in the accessibility tree, which is what we
	// want: these assert that lyrics are actually on screen
	async waitForLines(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.linePrefix);
	}

	async visibleLineTexts(): Promise<Array<string>> {
		const ordered = await this.sortedByY(await this.allByAccessibilityPrefix(this.linePrefix));
		const texts = await Promise.all(
			ordered.map(async (line) =>
				(await line.isDisplayed()) ? this.readElementText(line, 'lyrics-modal') : '',
			),
		);
		return texts.filter((text) => text !== '');
	}

	// the lyrics card runs to 80% of the screen, so it covers the backdrop's centre: tapping the
	// backdrop element itself lands on the card, where the modal swallows it. aim at whichever
	// strip of backdrop above or below the card is the taller one
	async dismiss(): Promise<void> {
		const card = this.elementByID(this.root);
		await card.waitForDisplayed({ timeoutMsg: 'Lyrics modal not visible' });
		const cardLocation = await card.getLocation();
		const cardSize = await card.getSize();
		const { height, width } = await this.driver.getWindowSize();

		const cardBottom = cardLocation.y + cardSize.height;
		const gapAbove = cardLocation.y;
		const gapBelow = height - cardBottom;
		const y =
			gapBelow >= gapAbove ? Math.floor(cardBottom + gapBelow / 2) : Math.floor(cardLocation.y / 2);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x: Math.floor(width / 2), y },
					{ button: 0, type: 'pointerDown' },
					{ duration: 50, type: 'pause' },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'tap-lyrics-backdrop',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();

		await this.waitForHidden();
	}

	async dismissIfVisible(): Promise<void> {
		if (!(await this.elementByID(this.root).isExisting())) return;
		await this.dismiss();
	}

	async waitForHidden(timeout = 10_000): Promise<void> {
		await this.driver.waitUntil(async () => !(await this.elementByID(this.root).isExisting()), {
			timeout,
			timeoutMsg: 'Lyrics modal did not dismiss',
		});
	}
}
