import { describe, expect, it } from 'bun:test';
import type { Track } from 'atolla_core/src/models/Track';
import { chainSources, type TrackPage, type TrackSource } from './TrackSource';

function makeTracks(ids: Array<string>): Array<Track> {
	return ids.map((id) => ({ duration: 100, id, name: `Track ${id}` }));
}

function pagedSource(pages: Array<Array<string>>): TrackSource {
	return (page) =>
		Promise.resolve({ hasMore: page < pages.length, items: makeTracks(pages[page - 1] ?? []) });
}

async function drain(source: TrackSource): Promise<Array<Array<string>>> {
	const chunks: Array<Array<string>> = [];
	let page = 1;
	while (page < 20) {
		const { hasMore, items } = await source(page, 50);
		chunks.push(items.map((track) => track.id));
		if (!hasMore) {
			return chunks;
		}
		page += 1;
	}
	throw new Error('source never reported hasMore false');
}

describe('chainSources', () => {
	it('yields each source in order', async () => {
		const chained = chainSources([
			pagedSource([['a']]),
			pagedSource([['b']]),
			pagedSource([['c']]),
		]);

		expect(await drain(chained)).toEqual([['a'], ['b'], ['c']]);
	});

	it('drains a multi-page source before moving to the next', async () => {
		const chained = chainSources([pagedSource([['a'], ['b'], ['c']]), pagedSource([['d']])]);

		expect(await drain(chained)).toEqual([['a'], ['b'], ['c'], ['d']]);
	});

	it('reports more while later sources remain even when the current one is done', async () => {
		const chained = chainSources([pagedSource([['a']]), pagedSource([['b']])]);

		expect(await chained(1, 50)).toEqual({ hasMore: true, items: makeTracks(['a']) });
		expect(await chained(2, 50)).toEqual({ hasMore: false, items: makeTracks(['b']) });
	});

	it('keeps going when a source returns an empty page but more to come', async () => {
		const chained = chainSources([pagedSource([[], ['a']]), pagedSource([['b']])]);

		expect(await drain(chained)).toEqual([[], ['a'], ['b']]);
	});

	it('asks each source for its own page numbers, not the chained ones', async () => {
		const requested: Array<Array<number>> = [[], []];
		const source = (index: number, pageCount: number): TrackSource => {
			return (page) => {
				requested[index].push(page);
				return Promise.resolve({ hasMore: page < pageCount, items: [] });
			};
		};
		const chained = chainSources([source(0, 2), source(1, 3)]);

		await drain(chained);

		expect(requested).toEqual([
			[1, 2],
			[1, 2, 3],
		]);
	});

	it('is exhausted with no sources', async () => {
		expect(await chainSources([])(1, 50)).toEqual({ hasMore: false, items: [] });
	});

	it('stays exhausted when called again after the last source', async () => {
		const chained = chainSources([pagedSource([['a']])]);

		await chained(1, 50);

		expect(await chained(2, 50)).toEqual({ hasMore: false, items: [] });
	});

	it('cancels the in-flight source page', () => {
		let cancelled = false;
		const chained = chainSources([
			() => {
				const pending: TrackPage = { hasMore: false, items: [] };
				const promise = Promise.resolve(pending) as unknown as {
					cancel?: () => void;
					then: Promise<TrackPage>['then'];
				};
				promise.cancel = () => {
					cancelled = true;
				};
				return promise;
			},
		]);

		chained(1, 50).cancel?.();

		expect(cancelled).toBe(true);
	});
});
