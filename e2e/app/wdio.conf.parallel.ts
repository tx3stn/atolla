import { getAndroidCapabilities, getIOSCapabilities } from './utils/device';
import { config as base } from './wdio.conf';

type Capabilities = Record<string, unknown>;

function createDevicePool(devices: Array<Capabilities>) {
	const slots = devices.map((caps) => ({ caps, cid: undefined as string | undefined }));

	return {
		claim(cid: string): Capabilities {
			const existing = slots.find((slot) => slot.cid === cid);
			if (existing) return existing.caps;

			const free = slots.find((slot) => slot.cid === undefined);
			if (!free) throw new Error(`No free device slot available for worker ${cid}`);

			free.cid = cid;
			return free.caps;
		},
		release(cid: string): void {
			const slot = slots.find((slot) => slot.cid === cid);
			if (slot) slot.cid = undefined;
		},
	};
}

const androidDevices = getAndroidCapabilities();
const iosDevices = getIOSCapabilities();

const pools: Record<string, ReturnType<typeof createDevicePool>> = {
	Android: createDevicePool(androidDevices),
	iOS: createDevicePool(iosDevices),
};

export const config = {
	...base,
	capabilities: [
		{ ...androidDevices[0], 'wdio:maxInstances': androidDevices.length },
		{ ...iosDevices[0], 'wdio:maxInstances': iosDevices.length },
	],
	maxInstances: androidDevices.length + iosDevices.length,
	mochaOpts: { ...base.mochaOpts, bail: 0 },
	onWorkerEnd(cid: string) {
		for (const pool of Object.values(pools)) pool.release(cid);
	},
	onWorkerStart(cid: string, caps: Capabilities) {
		const pool = pools[caps.platformName as string];
		if (pool) Object.assign(caps, pool.claim(cid));
	},
};
