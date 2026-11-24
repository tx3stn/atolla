// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
import { describe, expect, it } from 'bun:test';
import { Logger } from 'atolla_core/src/services/Logger';
import { migrateWaveformRecords, type OldWaveformStore } from './WaveformMigration';

const RECORDS_JSON = '{"track-1":{"trackId":"track-1","status":"ready","amps":"AQIDBA=="}}';

class FakeOldWaveformStore implements OldWaveformStore {
	removedAll = 0;

	constructor(private recordsJson: string | null) {}

	exists(key: string): Promise<boolean> {
		return Promise.resolve(key === 'waveform_records' && this.recordsJson !== null);
	}

	fetchString(key: string): Promise<string> {
		if (key !== 'waveform_records' || this.recordsJson === null) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(this.recordsJson);
	}

	removeAll(): Promise<void> {
		this.removedAll += 1;
		this.recordsJson = null;
		return Promise.resolve();
	}
}

describe('migrateWaveformRecords', () => {
	it('hands the old records to native unparsed, then empties the old store', async () => {
		const store = new FakeOldWaveformStore(RECORDS_JSON);
		const handed: Array<string> = [];

		await migrateWaveformRecords(store, (recordsJson) => {
			handed.push(recordsJson);
			return Promise.resolve(1);
		});

		expect(handed).toEqual([RECORDS_JSON]);
		expect(store.removedAll).toBe(1);
	});

	it('does nothing when the old store has no records', async () => {
		const store = new FakeOldWaveformStore(null);
		let migrations = 0;

		await migrateWaveformRecords(store, () => {
			migrations += 1;
			return Promise.resolve(0);
		});

		expect(migrations).toBe(0);
		expect(store.removedAll).toBe(0);
	});

	it('keeps the old records when the native migration fails, so the next launch tries again', async () => {
		const store = new FakeOldWaveformStore(RECORDS_JSON);

		await expect(
			migrateWaveformRecords(store, () => Promise.reject(new Error('boom'))),
		).rejects.toThrow('boom');

		expect(store.removedAll).toBe(0);
	});

	it('logs how many waveforms moved and how long it took', async () => {
		const writes: Array<string> = [];
		Logger.register({
			clearLog: () => {},
			shareLog: () => {},
			writeLog: (entry: string) => writes.push(entry),
		});
		Logger.setEnabled(true);

		await migrateWaveformRecords(new FakeOldWaveformStore(RECORDS_JSON), () => Promise.resolve(2));

		Logger.setEnabled(false);
		const entry = writes.find((line) => line.includes('[waveform-migration]'));
		expect(entry).toContain('"migrated":2');
		expect(entry).toContain('"durationMs":');
	});
});
