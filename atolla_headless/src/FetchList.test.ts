import { describe, expect, it } from 'bun:test';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { type FetchEntry, makeFetchList } from './FetchList';
import type { MediaServerAccess, MediaServerTransports } from './MediaServerTransports';
import type { QueueOwner } from './QueueOwner';

const AUTH_HEADER = 'MediaBrowser Token="abc"';

function access(): MediaServerAccess {
	return {
		authHeader: AUTH_HEADER,
		transport: {
			getTrackCacheUrl: (trackId: string) =>
				`https://demo.jellyfin.local/Audio/${trackId}/stream.mp3?static=true`,
		} as unknown as Transport,
	};
}

function entry(id: string): FetchEntry {
	return {
		authHeader: AUTH_HEADER,
		id,
		url: `https://demo.jellyfin.local/Audio/${id}/stream.mp3?static=true`,
	};
}

function fixture(options: {
	current?: string | null;
	forUser?: MediaServerTransports['forUser'];
	owner?: string | null;
}) {
	const sent: Array<string> = [];
	const fetchList = makeFetchList({
		currentTrackId: () => options.current ?? null,
		queueOwner: { get: () => options.owner ?? null } as QueueOwner,
		setFetchList: (list) => {
			sent.push(list);
		},
		transports: {
			forUser: options.forUser ?? (() => null),
			verify: () => Promise.reject(new Error('unused')),
		},
	});

	return { fetchList, sent };
}

describe('makeFetchList', () => {
	it('hands the fetcher nothing while no account owns the queue', () => {
		const { fetchList, sent } = fixture({ forUser: access, owner: null });

		fetchList.setWindow(['t1', 't2']);

		expect(sent.map((list) => JSON.parse(list))).toEqual([[]]);
	});

	it("hands the fetcher nothing while the owner's credential hasn't arrived", () => {
		const { fetchList, sent } = fixture({ owner: 'user-1' });

		fetchList.setWindow(['t1', 't2']);

		expect(sent.map((list) => JSON.parse(list))).toEqual([[]]);
	});

	it("lists the window's tracks in its order, with the owner's credential", () => {
		const { fetchList, sent } = fixture({ forUser: access, owner: 'user-1' });

		fetchList.setWindow(['t2', 't1']);

		expect(JSON.parse(sent[0])).toEqual([entry('t2'), entry('t1')]);
	});

	it('leaves out the track playing now, which the engine streams', () => {
		const { fetchList, sent } = fixture({ current: 't1', forUser: access, owner: 'user-1' });

		fetchList.setWindow(['t1', 't2']);

		expect(JSON.parse(sent[0])).toEqual([entry('t2')]);
	});

	it('lists the window once a credential arrives after it', () => {
		let forUser: MediaServerTransports['forUser'] = () => null;
		const { fetchList, sent } = fixture({ forUser: (userId) => forUser(userId), owner: 'user-1' });

		fetchList.setWindow(['t1']);
		forUser = access;
		fetchList.rebuild();

		expect(sent.map((list) => JSON.parse(list))).toEqual([[], [entry('t1')]]);
	});

	it('hands a list over once, not again until it changes', () => {
		const { fetchList, sent } = fixture({ forUser: access, owner: 'user-1' });

		fetchList.setWindow(['t1']);
		fetchList.rebuild();
		fetchList.setWindow(['t1']);

		expect(sent).toHaveLength(1);
	});
});
