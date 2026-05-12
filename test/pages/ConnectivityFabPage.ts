import { BasePage, type PlatformLocator } from './Base';

export class ConnectivityFabPage extends BasePage {
	private readonly locators = {
		fab: { android: '~connectivity-fab', ios: '~connectivity-fab' },
	} satisfies Record<string, PlatformLocator>;

	async isVisible(): Promise<boolean> {
		const el = this.element(this.locators.fab);
		if (!(await el.isExisting())) {
			return false;
		}
		return el.isDisplayed();
	}

	async tap(): Promise<void> {
		await this.element(this.locators.fab).click();
	}
}
