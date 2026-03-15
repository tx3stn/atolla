import type { Browser, ChainablePromiseElement } from 'webdriverio';

export class BasePage {
	constructor(private readonly driver: Browser) {}

	public elementByID(id: string): ChainablePromiseElement {
		return this.driver.$(`~${id}`);
	}
}
