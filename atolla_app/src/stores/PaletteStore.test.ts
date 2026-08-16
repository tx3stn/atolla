import { describe, expect, it } from 'bun:test';
import type { Palette } from '../models/Color';
import { type PaletteBackingStore, PaletteStore } from './PaletteStore';

const PALETTE: Palette = {
	accent: { hex: '#ff6b6b' },
	muted_on_surface: { hex: '#f4b7b7' },
	on_surface: { hex: '#ffe0e0' },
	surface: { hex: '#800000' },
};

const URL = 'https://example.com/art.png';

class FakeBackingStore implements PaletteBackingStore {
	values = new Map<string, string>();

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		if (value == null) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(value);
	}

	removeAll(): Promise<void> {
		this.values.clear();
		return Promise.resolve();
	}

	storeString(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}
}

class RejectingBackingStore implements PaletteBackingStore {
	fetchString(): Promise<string> {
		return Promise.reject(new Error('disk failure'));
	}

	removeAll(): Promise<void> {
		return Promise.reject(new Error('disk failure'));
	}

	storeString(): Promise<void> {
		return Promise.reject(new Error('disk failure'));
	}
}

describe('PaletteStore', () => {
	describe('loadPalette()', () => {
		it('returns a palette saved earlier', async () => {
			const store = new PaletteStore(new FakeBackingStore());

			await store.savePalette(URL, PALETTE);

			expect(await store.loadPalette(URL)).toEqual(PALETTE);
		});

		it('returns null for a url that was never saved', async () => {
			const store = new PaletteStore(new FakeBackingStore());

			expect(await store.loadPalette(URL)).toBeNull();
		});

		it('returns null when the stored value is not valid json', async () => {
			const backing = new FakeBackingStore();
			backing.values.set(URL, '{ not json');

			expect(await new PaletteStore(backing).loadPalette(URL)).toBeNull();
		});

		it('returns null when a stored palette is missing a colour', async () => {
			const backing = new FakeBackingStore();
			backing.values.set(URL, JSON.stringify({ ...PALETTE, surface: undefined }));

			expect(await new PaletteStore(backing).loadPalette(URL)).toBeNull();
		});

		it('returns null when a stored colour is not a hex object', async () => {
			const backing = new FakeBackingStore();
			backing.values.set(URL, JSON.stringify({ ...PALETTE, accent: '#ff6b6b' }));

			expect(await new PaletteStore(backing).loadPalette(URL)).toBeNull();
		});
	});

	describe('clearAll()', () => {
		it('drops previously saved palettes', async () => {
			const store = new PaletteStore(new FakeBackingStore());
			await store.savePalette(URL, PALETTE);

			await store.clearAll();

			expect(await store.loadPalette(URL)).toBeNull();
		});
	});

	describe('when the backing store fails', () => {
		it('does not propagate save errors', async () => {
			const store = new PaletteStore(new RejectingBackingStore());

			await expect(store.savePalette(URL, PALETTE)).resolves.toBeUndefined();
		});

		it('resolves loads to null', async () => {
			const store = new PaletteStore(new RejectingBackingStore());

			expect(await store.loadPalette(URL)).toBeNull();
		});

		it('does not propagate clear errors', async () => {
			const store = new PaletteStore(new RejectingBackingStore());

			await expect(store.clearAll()).resolves.toBeUndefined();
		});
	});
});
