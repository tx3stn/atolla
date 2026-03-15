// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';

export class Preferences {
	private store = new PersistentStore('preferences');

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
