import { mkdirSync } from 'node:fs';
import { getAttachedCapabilities, Platforms } from '../utils/device';
import { attachToRunningApp, onCompleteHook } from '../utils/hooks';
import { config as base } from '../wdio.conf';
import { CAPTURE_DIR, combineReadmeImages } from './captures';

const platform = process.env.E2E_PLATFORM === 'iOS' ? Platforms.iOS : Platforms.Android;

export const config = {
	...base,
	before: attachToRunningApp,
	capabilities: getAttachedCapabilities(platform),
	// captures walk grids looking for named items, which takes longer than an assertion-led spec
	mochaOpts: { ...base.mochaOpts, timeout: 240_000 },
	async onComplete() {
		onCompleteHook();
		await combineReadmeImages();
	},
	onPrepare: () => {
		mkdirSync(CAPTURE_DIR, { recursive: true });
	},
	specs: ['*.test.ts'],
};
