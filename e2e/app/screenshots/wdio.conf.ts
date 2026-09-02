import { connectToServer } from '../utils/hooks';
import { config as base } from '../wdio.conf';

export async function beforeHook(): Promise<void> {
	const serverURL = process.env.SERVER_URL;

	if (!serverURL) {
		throw new Error('no server url specified');
	}
	await connectToServer(serverURL);
}

export const config = {
	...base,
	before: beforeHook,
	specs: ['*.test.ts'],
};
