import { BasePage } from './Base';

export class ConnectivityFabPage extends BasePage {
	private readonly fab = 'connectivity-fab';

	async isVisible(): Promise<boolean> {
		const el = this.elementByID(this.fab);
		if (!(await el.isExisting())) {
			return false;
		}

		return el.isDisplayed();
	}

	async tap(): Promise<void> {
		await this.elementByID(this.fab).click();
	}
}
