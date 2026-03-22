// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import type { PaletteStore } from './ArtworkPaletteService';
import type { Palette } from './color/types';

export class PersistentPaletteStore implements PaletteStore {
	private store = new PersistentStore('artwork_palettes', { deviceGlobal: true });

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
}
