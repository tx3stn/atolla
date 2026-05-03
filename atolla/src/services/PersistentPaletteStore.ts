import type { PersistentStore } from 'persistence/src/PersistentStore';
import type { PaletteStore } from './ArtworkPaletteService';
import type { Palette } from './color/types';

export class PersistentPaletteStore implements PaletteStore {
	constructor(private store: PersistentStore) {}

	async loadPalette(imageUrl: string): Promise<Palette | null> {
		try {
			const json = await this.store.fetchString(imageUrl);
			if (!json) return null;
			return JSON.parse(json) as Palette;
		} catch {
			return null;
		}
	}

	async savePalette(imageUrl: string, palette: Palette): Promise<void> {
		try {
			await this.store.storeString(imageUrl, JSON.stringify(palette));
		} catch {
			// best-effort persistence
		}
	}

	async clearAll(): Promise<void> {
		try {
			await this.store.removeAll();
		} catch {
			// best-effort
		}
	}
}
