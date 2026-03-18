// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { type ConnectionMode, ConnectionModes } from '../transports/Model';

export class Preferences {
	private store = new PersistentStore('preferences', { deviceGlobal: true });

	async getMode(): Promise<ConnectionMode> {
		try {
			return await this.store.fetchString('mode');
		} catch {
			// FIXME: update to online
			return ConnectionModes.mock;
		}
	}

	async setMode(mode: ConnectionMode): Promise<void> {
		await this.store.storeString('mode', mode);
	}
}
