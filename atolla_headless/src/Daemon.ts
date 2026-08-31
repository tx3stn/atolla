import { getLogger, Logger, type LogWriter } from 'atolla_core/src/services/Logger';
import type { PlayerConfig } from './PlayerConfig';

export interface DaemonDeps {
	config: PlayerConfig;
	log: LogWriter;
}

export function startDaemon(deps: DaemonDeps): Promise<number> {
	Logger.setWriter(deps.log);
	getLogger('daemon').info('started', { name: deps.config.name });

	return new Promise<number>(() => {});
}
