import { BasePage } from './Base';

export class SortNavPanelPage extends BasePage {
	private readonly headerNav = 'library-header-nav';
	private readonly letterPrefix = 'letter-filter-';

	// the drag has to start on the header's tab row: the header's padding bands around it
	// don't deliver the gesture, so anchoring on the header itself misses
	async open(): Promise<void> {
		const nav = this.elementByID(this.headerNav);
		await nav.waitForDisplayed({ timeoutMsg: 'Timed out waiting for the library header tabs' });

		const location = await nav.getLocation();
		const size = await nav.getSize();
		const x = Math.floor(location.x + size.width * 0.5);
		const startY = Math.floor(location.y + size.height * 0.5);

		// the header opens the panel on a vertical drag past 18px; overshoot so the
		// threshold is cleared even when the drag is sampled coarsely
		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: startY },
					{ button: 0, type: 'pointerDown' },
					{ duration: 60, type: 'pointerMove', x, y: startY + 30 },
					{ duration: 60, type: 'pointerMove', x, y: startY + 60 },
					{ duration: 60, type: 'pointerMove', x, y: startY + 90 },
					{ duration: 150, type: 'pause' },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'sort-nav-panel-open-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();

		await this.waitForVisibleAccessibilityPrefix(this.letterPrefix);
	}

	async tapLetter(letter: string): Promise<void> {
		const el = this.elementByID(`${this.letterPrefix}${letter}`);
		await el.waitForDisplayed({
			timeoutMsg: `Timed out waiting for the ${letter} letter filter button`,
		});
		await el.click();
	}
}
