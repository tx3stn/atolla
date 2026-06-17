import type { PersistentStore } from 'persistence/src/PersistentStore';
import type { Palette } from '../models/Color';
import type { PaletteStore } from './ArtworkPaletteService';

export class PersistentPaletteStore implements PaletteStore {
	constructor(private store: PersistentStore) {}

	async loadPalette(imageUrl: string): Promise<Palette | null> {
		try {
			const json = await this.store.fetchString(imageUrl);
			if (!json) return null;
			const parsed: unknown = JSON.parse(json);
			return isPalette(parsed) ? parsed : null;
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

function isColorHex(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as Record<string, unknown>).hex === 'string'
	);
}

function isPalette(value: unknown): value is Palette {
	if (typeof value !== 'object' || value === null) return false;
	const p = value as Record<string, unknown>;
	return (
		isColorHex(p.accent) &&
		isColorHex(p.muted_on_surface) &&
		isColorHex(p.on_surface) &&
		isColorHex(p.primary) &&
		isColorHex(p.surface)
	);
}
