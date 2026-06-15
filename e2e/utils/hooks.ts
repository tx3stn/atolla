import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { ConnectionPage } from '../pages/ConnectionPage';
import { ConnectivityFabPage } from '../pages/ConnectivityFabPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';

const SCREENSHOT_DIR = 'e2e/screenshots';

async function ensureMockMode(): Promise<void> {
	const connectionPage = new ConnectionPage(browser);
	const footer = new FooterPage(browser);
	const connectivityFab = new ConnectivityFabPage(browser);

	await browser.waitUntil(
		async () =>
			(await connectionPage.isVisible()) ||
			(await footer.isVisible()) ||
			(await connectivityFab.isVisible()),
		{ timeout: 30_000, timeoutMsg: 'App did not finish bootstrapping' },
	);

	if (await connectionPage.isVisible()) {
		await connectionPage.connectToMock();
	} else {
		await connectivityFab.tap();
		await connectionPage.connectToMock();
	}

	await footer.tapHome();
	await new HomePage(browser).waitForAlbumCards();
}

export function onCompleteHook(): void {
	const manifest = path.join(SCREENSHOT_DIR, 'manifest.txt');
	try {
		const contents = fs.readFileSync(manifest, 'utf8').trim();
		if (!contents) return;
		console.error('\n--- Failed test screenshots ---');
		for (const line of contents.split('\n')) {
			console.error(`  file://${line}`);
		}
		console.error('------------------------------\n');
		fs.unlinkSync(manifest);
	} catch {
		// no manifest means no failures; nothing to print
	}
}

export async function beforeHook(): Promise<void> {
	const isIOS = (browser.capabilities.platformName as string).toLowerCase() === 'ios';

	// The session already launches the app fresh (noReset clears app data per session),
	// so there's nothing to terminate or relaunch here. On Android the emulator network
	// stack may not be ready right after boot: wait for wifi or data so the app can reach
	// the mock server.
	if (!isIOS) {
		await browser.waitUntil(
			async () => {
				try {
					const connectivity = (await browser.execute('mobile: getConnectivity', {
						services: ['wifi', 'data'],
					})) as { data?: unknown; wifi?: unknown };
					return connectivity.wifi === true || connectivity.data === true;
				} catch {
					return true;
				}
			},
			{ timeout: 30_000, timeoutMsg: 'Network not ready before app launch' },
		);
	}

	await ensureMockMode();
}

async function saveFailureScreenshot(subject: unknown): Promise<void> {
	try {
		const screenshot = await browser.takeScreenshot();
		fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
		const title =
			(subject as { fullTitle?: string }).fullTitle ??
			(subject as { title?: string }).title ??
			'unknown';
		const safeName = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
		const file = path.join(SCREENSHOT_DIR, `${Date.now()}-${safeName}.png`);
		fs.writeFileSync(file, Buffer.from(screenshot, 'base64'));
		fs.appendFileSync(path.join(SCREENSHOT_DIR, 'manifest.txt'), `${path.resolve(file)}\n`);
	} catch {
		// session may already be broken; screenshot is best-effort
	}
}

let lastSuiteTitle = '';

export function beforeSuiteHook(_suite: { title?: string }): void {}

export function beforeTestHook(test: {
	fullTitle?: string;
	title?: string;
	parent?: string;
}): void {
	const suite = test.parent ?? '';
	if (suite && suite !== lastSuiteTitle) {
		lastSuiteTitle = suite;
		console.log(chalk.bold.green(`󰙨 ${suite}`));
	}

	console.log(`${chalk.blue(' ')} ${test.title ?? 'unknown'}`);
}

export async function afterTestHook(
	test: unknown,
	_context: unknown,
	{ error }: { error?: Error },
): Promise<void> {
	if (error) await saveFailureScreenshot(test);
}

export async function afterHookHook(
	hook: unknown,
	_context: unknown,
	{ error }: { error?: Error },
): Promise<void> {
	if (error) await saveFailureScreenshot(hook);
}
