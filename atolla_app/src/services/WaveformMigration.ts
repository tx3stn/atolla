// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
import { getLogger } from 'atolla_core/src/services/Logger';

const log = getLogger('waveform-migration');

const RECORDS_KEY = 'waveform_records';

export interface OldWaveformStore {
	exists(key: string): Promise<boolean>;
	fetchString(key: string): Promise<string>;
	removeAll(): Promise<void>;
}

export async function migrateWaveformRecords(
	store: OldWaveformStore,
	migrate: (recordsJson: string) => Promise<number>,
): Promise<void> {
	if (!(await store.exists(RECORDS_KEY))) return;

	const startedAt = Date.now();
	const migrated = await migrate(await store.fetchString(RECORDS_KEY));
	log.info('migrated waveforms', { durationMs: Date.now() - startedAt, migrated });

	await store.removeAll();
}
