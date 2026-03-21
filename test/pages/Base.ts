import type { Browser, ChainablePromiseElement } from 'webdriverio';

export class BasePage {
	constructor(protected readonly driver: Browser) {}

	public elementByID(id: string): ChainablePromiseElement {
		return this.driver.$(`~${id}`);
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
