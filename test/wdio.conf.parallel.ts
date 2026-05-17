import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getAndroidCapabilities, getIOSCapabilities } from './utils/device';
import { afterHookHook, afterTestHook, beforeHook, onCompleteHook } from './utils/hooks';

function collectSpecFiles(dir: string): Array<string> {
	const entries = readdirSync(dir, { withFileTypes: true });
	const specs: Array<string> = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			specs.push(...collectSpecFiles(fullPath));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith('.test.ts')) {
			specs.push(fullPath);
		}
	}

	return specs;
}

function splitSpecsAcrossWorkers(specs: Array<string>, workers: number): Array<Array<string>> {
	const shards = Array.from({ length: workers }, () => [] as Array<string>);

	for (const [index, spec] of specs.entries()) {
		shards[index % workers]?.push(spec);
	}

	return shards;
}

const androidCaps = getAndroidCapabilities();
const iosCaps = getIOSCapabilities();
const workerCount = androidCaps.length + iosCaps.length;
const specRoot = resolve(process.cwd(), 'test');
const allSpecs = collectSpecFiles(specRoot).sort();

const androidShards = splitSpecsAcrossWorkers(allSpecs, androidCaps.length);
const iosShards = splitSpecsAcrossWorkers(allSpecs, iosCaps.length);

const shardedCapabilities = [
	...androidCaps.map((cap, index) => ({ ...cap, 'wdio:specs': androidShards[index] })),
	...iosCaps.map((cap, index) => ({ ...cap, 'wdio:specs': iosShards[index] })),
];

export const config = {
	afterHook: afterHookHook,
	afterTest: afterTestHook,
	before: beforeHook,
	capabilities: shardedCapabilities,
	connectionRetryCount: 3,
	connectionRetryTimeout: 300_000,
	exclude: [],
	framework: 'mocha',
	logLevel: 'warn',
	maxInstances: workerCount,
	maxInstancesPerCapability: 1,
	mochaOpts: {
		bail: 0,
		timeout: 120_000,
	},
	onComplete: onCompleteHook,
	reporters: ['spec'],
	runner: 'local',
	services: ['appium'],
	specs: ['./**/*.test.ts'],
	waitforTimeout: 10_000,
};
