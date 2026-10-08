import { describe, expect, it } from 'bun:test';
import type { AudioEngine } from './Audio';
import { makeClock } from './Clock';
import { makeStateVersion } from './StateVersion';

const LOUNGE = { host: '192.168.1.43', port: 45890 };

interface FakeClockEngine
	extends Pick<AudioEngine, 'clockNowNs' | 'clockSynced' | 'followClock' | 'provideClock'> {
	followed: Array<{ host: string; port: number }>;
	serving: boolean;
	synced: boolean;
}

function fakeEngine(): FakeClockEngine {
	const engine: FakeClockEngine = {
		clockNowNs: () => 0,
		clockSynced: () => engine.synced,
		followClock: (host, port) => {
			engine.followed.push({ host, port });
			return true;
		},
		followed: [],
		provideClock: () => engine.serving,
		serving: true,
		synced: false,
	};

	return engine;
}

function fixture() {
	const audio = fakeEngine();
	const version = makeStateVersion();
	const clock = makeClock({ audio, version });

	return { audio, clock, version };
}

describe('makeClock', () => {
	it('announces the moment it locks on to the clock it follows, and only then', () => {
		const { audio, clock, version } = fixture();
		clock.follow(LOUNGE);
		const before = version.current;

		clock.tick();
		audio.synced = true;
		clock.tick();
		clock.tick();

		expect(version.current).toBe(before + 1);
	});

	it('leaves the engine and the version alone when told to follow the clock it already follows', () => {
		const { audio, clock, version } = fixture();
		clock.follow(LOUNGE);
		const before = version.current;

		clock.follow({ ...LOUNGE });

		expect(audio.followed).toHaveLength(1);
		expect(version.current).toBe(before);
	});

	it('has nothing to read when its clock could not be served', () => {
		const { audio, clock } = fixture();
		audio.serving = false;

		clock.provide('0.0.0.0', 45890);

		expect(clock.reading()).toBeNull();
	});
});
