import { FooterPage } from '../../../pages/Footer';
import { HomePage } from '../../../pages/HomePage';
import { IntegrationConnectModal } from '../../../pages/IntegrationConnectModal';
import { SettingsPage } from '../../../pages/SettingsPage';
import { mockLidarrUrl } from '../../../utils/hooks';

describe('upcoming releases', () => {
	let footer: FooterPage;
	let homePage: HomePage;
	let modal: IntegrationConnectModal;
	let settingsPage: SettingsPage;

	beforeEach(() => {
		footer = new FooterPage(browser);
		homePage = new HomePage(browser);
		modal = new IntegrationConnectModal(browser);
		settingsPage = new SettingsPage(browser);
	});

	afterEach(async () => {
		if (await modal.isOpen()) {
			await modal.dismissKeyboard();
			await modal.tapCancel();
			return;
		}

		await footer.tapSettings();
		await settingsPage.waitForLoad();
		await settingsPage.scrollToTop();
		await settingsPage.tapLidarrToggle();
		if (await modal.isOpen()) {
			await modal.tapCancel();
		}
	});

	async function connectMockLidarr(): Promise<void> {
		await footer.tapSettings();
		await settingsPage.waitForLoad();
		await settingsPage.scrollToTop();

		await settingsPage.tapLidarrToggle();
		await modal.waitForVisible();
		await modal.enterUrl(mockLidarrUrl());
		await modal.enterApiKey('atolla-mock-lidarr-key');
		await modal.dismissKeyboard();
		await modal.tapAuthenticate();
		await modal.waitForHidden();
	}

	it('shows an album from lidarr on home once lidarr is connected', async () => {
		await connectMockLidarr();
		await footer.tapHome();
		await homePage.waitForLoad();

		expect(await homePage.isUpcomingAlbumDisplayed('1')).toBe(true);
	});

	it('says out today on a release that comes out today', async () => {
		await connectMockLidarr();
		await footer.tapHome();
		await homePage.waitForLoad();

		expect(await homePage.upcomingReleaseDay('2')).toBe('out today');
	});
});
