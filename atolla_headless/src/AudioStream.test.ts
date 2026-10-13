import { describe, expect, it } from 'bun:test';
import type { AudioEngine } from './Audio';
import { makeAudioStream } from './AudioStream';
import { makeStateVersion } from './StateVersion';

const KITCHEN = { host: '192.168.1.42', port: 45891 };

interface FakeStreamEngine extends Pick<AudioEngine, 'joinSource' | 'receiving' | 'serveStream'> {
	joinable: boolean;
	joined: Array<{ host: string; port: number }>;
	listening: boolean;
	receives: boolean;
}

function fakeEngine(): FakeStreamEngine {
	const engine: FakeStreamEngine = {
		joinable: true,
		joined: [],
		joinSource: (host, port) => {
			engine.joined.push({ host, port });
			return engine.joinable;
		},
		listening: true,
		receives: false,
		receiving: () => engine.receives,
		serveStream: () => engine.listening,
	};

	return engine;
}

function fixture() {
	const audio = fakeEngine();
	const version = makeStateVersion();
	const stream = makeAudioStream({ audio, version });

	return { audio, stream, version };
}

describe('makeAudioStream', () => {
	it('announces the moment audio starts arriving from the source it joined, and when it stops', () => {
		const { audio, stream, version } = fixture();
		stream.join(KITCHEN);
		const before = version.current;

		stream.tick();
		audio.receives = true;
		stream.tick();
		stream.tick();
		audio.receives = false;
		stream.tick();

		expect(version.current).toBe(before + 2);
	});

	it('leaves the engine and the version alone when told to join the source it already joined', () => {
		const { audio, stream, version } = fixture();
		stream.join(KITCHEN);
		const before = version.current;

		stream.join({ ...KITCHEN });

		expect(audio.joined).toHaveLength(1);
		expect(version.current).toBe(before);
	});

	it('reports the source it joined, and none once it leaves', () => {
		const { audio, stream } = fixture();

		stream.join(KITCHEN);
		const joined = stream.source();
		stream.join(null);

		expect(joined).toEqual({ ...KITCHEN, receiving: false });
		expect(stream.source()).toBeUndefined();
		expect(audio.joined).toEqual([KITCHEN, { host: '', port: 0 }]);
	});

	it('reports no source when the engine could not join it', () => {
		const { audio, stream } = fixture();
		audio.joinable = false;

		stream.join(KITCHEN);

		expect(stream.source()).toBeUndefined();
	});

	it('has no port to report when its stream could not be served', () => {
		const { audio, stream } = fixture();
		audio.listening = false;

		stream.serve('0.0.0.0', 45891);

		expect(stream.served()).toBeNull();
	});
});
