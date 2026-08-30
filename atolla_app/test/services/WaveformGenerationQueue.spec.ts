import 'jasmine/src/jasmine';
import { WaveformGenerationQueue } from 'atolla_app/src/services/WaveformGenerationQueue';
import type { IWaveformNativeWorker } from 'atolla_app/src/services/WaveformNativeWorker';
import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import * as WorkerService from 'worker/src/WorkerService';

type MockWorker = IWorkerServiceClient<IWaveformNativeWorker> & {
	api: { generateWaveform: jasmine.Spy };
	dispose: jasmine.Spy;
};

type GenerateImpl = (trackId: string, audioPath: string) => Promise<string | null>;

function createMockWorker(generateImpl: GenerateImpl): MockWorker {
	return {
		api: {
			generateWaveform: jasmine.createSpy('generateWaveform').and.callFake(generateImpl),
		},
		dispose: jasmine.createSpy('dispose'),
		serviceId: 0,
	};
}

function createMockService() {
	const ready = new Map<string, string>();
	return {
		_ready: ready,
		getAmps: (id: string) => ready.get(id) ?? null,
		getStatus: (id: string): 'ready' | 'failed' | null => {
			const value = ready.get(id);
			if (value === undefined) return null;
			return value === '__failed__' ? 'failed' : 'ready';
		},
		onGenerationFailed: jasmine.createSpy('onGenerationFailed').and.callFake((id: string) => {
			ready.set(id, '__failed__');
		}),
		onGenerationSucceeded: jasmine
			.createSpy('onGenerationSucceeded')
			.and.callFake((id: string, amps: string) => {
				ready.set(id, amps);
			}),
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, reject, resolve };
}

async function tick() {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('WaveformGenerationQueue', () => {
	let workers: Array<MockWorker>;
	let generateFor: (workerIndex: number) => GenerateImpl;

	beforeEach(() => {
		workers = [];
		generateFor = () => () => Promise.resolve('amps-base64-ok');
		// biome-ignore lint/suspicious/noExplicitAny: spy returns mock, not the full generic type
		spyOn(WorkerService, 'startWorkerService').and.callFake((): any => {
			const index = workers.length;
			const w = createMockWorker((trackId, audioPath) => generateFor(index)(trackId, audioPath));
			workers.push(w);
			return w;
		});
	});

	function useWorkerBehaviour(impl: GenerateImpl): void {
		generateFor = () => impl;
	}

	function makeQueue(service = createMockService()) {
		const queue = new WaveformGenerationQueue(service as never);
		return { queue, service };
	}

	describe('enqueue', () => {
		it('skips a track whose waveform is already ready', async () => {
			const service = createMockService();
			service._ready.set('t1', 'data:image/png;base64,existing');
			const { queue } = makeQueue(service);

			queue.enqueue('t1', '/audio/t1.flac');
			await tick();

			const allCalls = workers.flatMap((worker) => worker.api.generateWaveform.calls.allArgs());
			expect(allCalls.filter(([id]) => id === 't1').length).toBe(0);
			queue.dispose();
		});

		it('skips a track already pending in the queue', async () => {
			const d = deferred<string | null>();
			const { queue } = makeQueue();
			useWorkerBehaviour(() => d.promise);
			// fill all 3 worker slots
			queue.enqueue('t1', '/a/t1.flac');
			queue.enqueue('t2', '/a/t2.flac');
			queue.enqueue('t3', '/a/t3.flac');
			// t4 goes to the pending queue
			queue.enqueue('t4', '/a/t4.flac');
			// enqueue t4 again, should be ignored
			queue.enqueue('t4', '/a/t4.flac');

			d.resolve('data:image/png;base64,x');
			await tick();

			const t4Calls = workers
				.flatMap((worker) => worker.api.generateWaveform.calls.allArgs())
				.filter(([id]) => id === 't4');
			expect(t4Calls.length).toBe(1);
			queue.dispose();
		});

		it('skips a track that is already in-flight', () => {
			const d = deferred<string | null>();
			const { queue } = makeQueue();
			// all workers use the same deferred so whichever handles t1 stays busy
			useWorkerBehaviour(() => d.promise);

			queue.enqueue('t1', '/a/t1.flac');
			queue.enqueue('t1', '/a/t1.flac');

			const t1Calls = workers
				.flatMap((worker) => worker.api.generateWaveform.calls.allArgs())
				.filter(([id]) => id === 't1');
			expect(t1Calls.length).toBe(1);
			d.resolve(null);
			queue.dispose();
		});

		it('dispatches work to a worker immediately when a slot is free', async () => {
			const { queue } = makeQueue();

			queue.enqueue('t1', '/audio/t1.flac');
			await tick();

			expect(workers.length).toBe(1);
			const allCalls = workers.flatMap((worker) => worker.api.generateWaveform.calls.allArgs());
			expect(allCalls.length).toBe(1);
			expect(allCalls[0][0]).toBe('t1');
			expect(allCalls[0][1]).toBe('/audio/t1.flac');
			queue.dispose();
		});

		it('calls onGenerationSucceeded when the worker returns a URL', async () => {
			const { queue, service } = makeQueue();

			queue.enqueue('t1', '/audio/t1.flac');
			await tick();

			expect(service.onGenerationSucceeded).toHaveBeenCalledWith('t1', 'amps-base64-ok');
			queue.dispose();
		});

		it('calls onGenerationFailed when the worker returns null', async () => {
			const { queue, service } = makeQueue();
			useWorkerBehaviour(() => Promise.resolve(null));

			queue.enqueue('t1', '/audio/t1.flac');
			await tick();

			expect(service.onGenerationFailed).toHaveBeenCalledWith('t1');
			queue.dispose();
		});

		it('calls onGenerationFailed when the worker throws', async () => {
			const { queue, service } = makeQueue();
			useWorkerBehaviour(() => Promise.reject(new Error('worker crash')));

			queue.enqueue('t1', '/audio/t1.flac');
			await tick();

			expect(service.onGenerationFailed).toHaveBeenCalledWith('t1');
			queue.dispose();
		});

		it('queues a fourth track when all three worker slots are busy', async () => {
			const d = deferred<string | null>();
			const { queue } = makeQueue();
			useWorkerBehaviour(() => d.promise);

			queue.enqueue('t1', '/a/t1.flac');
			queue.enqueue('t2', '/a/t2.flac');
			queue.enqueue('t3', '/a/t3.flac');
			queue.enqueue('t4', '/a/t4.flac');
			await tick();

			// t4 should not yet be dispatched
			const beforeCalls = workers
				.flatMap((worker) => worker.api.generateWaveform.calls.allArgs())
				.map(([id]) => id);
			expect(beforeCalls.length).toBe(3);
			expect(beforeCalls).not.toContain('t4');

			// release all slots, t4 should run
			d.resolve('data:image/png;base64,ok');
			await tick();

			const afterCalls = workers
				.flatMap((worker) => worker.api.generateWaveform.calls.allArgs())
				.map(([id]) => id);
			expect(afterCalls).toContain('t4');
			expect(workers.length).toBe(3);
			queue.dispose();
		});
	});

	describe('prioritize', () => {
		it('moves a queued track to the front', async () => {
			const d = deferred<string | null>();
			const callOrder: Array<string> = [];
			const { queue } = makeQueue();
			useWorkerBehaviour((trackId) => {
				callOrder.push(trackId);
				return d.promise;
			});

			queue.enqueue('t1', '/a/t1.flac');
			queue.enqueue('t2', '/a/t2.flac');
			queue.enqueue('t3', '/a/t3.flac');
			// t4 and t5 sit in the pending queue (all workers are busy)
			queue.enqueue('t4', '/a/t4.flac');
			queue.enqueue('t5', '/a/t5.flac');

			queue.prioritize('t5');

			// free all slots, t5 should be picked up before t4
			d.resolve('data:image/png;base64,x');
			await tick();

			const t4Pos = callOrder.indexOf('t4');
			const t5Pos = callOrder.indexOf('t5');
			expect(t5Pos).toBeGreaterThanOrEqual(0);
			if (t4Pos >= 0) expect(t5Pos).toBeLessThan(t4Pos);

			queue.dispose();
		});
	});

	describe('reorderToMatch', () => {
		it('reorders pending entries to match the given sequence', async () => {
			const d = deferred<string | null>();
			const callOrder: Array<string> = [];
			const { queue } = makeQueue();
			useWorkerBehaviour((trackId) => {
				callOrder.push(trackId);
				return d.promise;
			});

			queue.enqueue('t1', '/a/t1.flac');
			queue.enqueue('t2', '/a/t2.flac');
			queue.enqueue('t3', '/a/t3.flac');
			// t4 → t5 in the pending queue
			queue.enqueue('t4', '/a/t4.flac');
			queue.enqueue('t5', '/a/t5.flac');

			// reverse t4/t5 priority
			queue.reorderToMatch(['t1', 't2', 't3', 't5', 't4']);

			d.resolve('data:image/png;base64,x');
			await tick();

			const t4Pos = callOrder.indexOf('t4');
			const t5Pos = callOrder.indexOf('t5');
			expect(t5Pos).toBeGreaterThanOrEqual(0);
			if (t4Pos >= 0) expect(t5Pos).toBeLessThan(t4Pos);

			queue.dispose();
		});

		it('abandons in-flight jobs that rank below the new queue front', async () => {
			const deferreds = [
				deferred<string | null>(),
				deferred<string | null>(),
				deferred<string | null>(),
			];
			const callOrder: Array<string> = [];
			const { queue } = makeQueue();
			generateFor = (index) => (trackId) => {
				callOrder.push(trackId);
				return deferreds[index].promise;
			};

			// fill all workers: t1/t2/t3 in-flight, t4 pending
			queue.enqueue('t1', '/a/t1.flac');
			queue.enqueue('t2', '/a/t2.flac');
			queue.enqueue('t3', '/a/t3.flac');
			queue.enqueue('t4', '/a/t4.flac');
			await tick();

			// make t4 the highest priority, so t1/t2/t3 become lower priority and are abandoned
			queue.reorderToMatch(['t4', 't1', 't2', 't3']);

			// resolve the workers that had abandoned jobs
			deferreds[0].resolve('data:image/png;base64,t1');
			deferreds[1].resolve('data:image/png;base64,t2');
			deferreds[2].resolve('data:image/png;base64,t3');
			await tick();

			// t4 should be the next track dispatched after the abandoned slots free up
			const t4Pos = callOrder.indexOf('t4');
			expect(t4Pos).toBeGreaterThanOrEqual(0);
			// t4 must come after the initial 3 dispatches (positions 0-2)
			expect(t4Pos).toBe(3);

			queue.dispose();
		});
	});

	describe('dispose', () => {
		it('disposes every worker it started', async () => {
			const d = deferred<string | null>();
			const { queue } = makeQueue();
			useWorkerBehaviour(() => d.promise);
			queue.enqueue('t1', '/a/t1.flac');
			queue.enqueue('t2', '/a/t2.flac');
			queue.enqueue('t3', '/a/t3.flac');

			queue.dispose();
			d.resolve(null);
			await tick();

			expect(workers.length).toBe(3);
			for (const worker of workers) {
				expect(worker.dispose).toHaveBeenCalledTimes(1);
			}
		});

		it('has nothing to dispose when no work was ever queued', () => {
			const { queue } = makeQueue();

			queue.dispose();

			expect(workers.length).toBe(0);
		});

		it('reports nothing for jobs still in flight when disposed', async () => {
			const d = deferred<string | null>();
			const { queue, service } = makeQueue();
			useWorkerBehaviour(() => d.promise);
			queue.enqueue('t1', '/a/t1.flac');

			queue.dispose();
			d.resolve('amps-base64-ok');
			await tick();

			expect(service.onGenerationSucceeded).not.toHaveBeenCalled();
			expect(service.onGenerationFailed).not.toHaveBeenCalled();
		});

		it('dispatches no queued work after being disposed', async () => {
			const d = deferred<string | null>();
			const { queue } = makeQueue();
			useWorkerBehaviour(() => d.promise);
			queue.enqueue('t1', '/a/t1.flac');
			queue.enqueue('t2', '/a/t2.flac');
			queue.enqueue('t3', '/a/t3.flac');
			queue.enqueue('t4', '/a/t4.flac');

			queue.dispose();
			d.resolve(null);
			await tick();

			const dispatched = workers
				.flatMap((worker) => worker.api.generateWaveform.calls.allArgs())
				.map(([id]) => id);
			expect(dispatched).not.toContain('t4');
		});
	});
});
