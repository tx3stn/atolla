import type { Palette } from '../models/Color';

export interface PaletteStorage {
	clearAll(): Promise<void>;
	loadPalette(imageUrl: string): Promise<Palette | null>;
	savePalette(imageUrl: string, palette: Palette): Promise<void>;
}

export interface PaletteBackingStore {
	fetchString(key: string): Promise<string>;
	removeAll(): Promise<void>;
	storeString(key: string, value: string): Promise<void>;
}

export class PaletteStore implements PaletteStorage {
	constructor(private store: PaletteBackingStore) {}

	async clearAll(): Promise<void> {
		try {
			await this.store.removeAll();
		} catch {
			// best-effort
		}
	}

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
		isColorHex(p.surface)
	);
}
