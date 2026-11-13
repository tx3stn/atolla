import type { MediaServerTransports } from './MediaServerTransports';
import type { QueueOwner } from './QueueOwner';

export interface FetchEntry {
	authHeader: string;
	id: string;
	url: string;
}

export interface FetchListDeps {
	currentTrackId: () => string | null;
	queueOwner: QueueOwner;
	setFetchList: (list: string) => void;
	transports: MediaServerTransports;
}

export interface FetchList {
	rebuild: () => void;
	setWindow: (trackIds: Array<string>) => void;
}

export function makeFetchList(deps: FetchListDeps): FetchList {
	let window: Array<string> = [];
	let sent: string | null = null;

	const entries = (): Array<FetchEntry> => {
		const owner = deps.queueOwner.get();
		if (owner === null) {
			return [];
		}

		const access = deps.transports.forUser(owner);
		if (access === null) {
			return [];
		}

		const current = deps.currentTrackId();
		const list: Array<FetchEntry> = [];

		for (const id of window) {
			if (id === current) {
				continue;
			}

			const url = access.transport.getTrackCacheUrl(id);
			if (url !== null) {
				list.push({ authHeader: access.authHeader, id, url });
			}
		}

		return list;
	};

	const rebuild = (): void => {
		const list = JSON.stringify(entries());
		if (list === sent) {
			return;
		}

		sent = list;
		deps.setFetchList(list);
	};

	return {
		rebuild,
		setWindow: (trackIds) => {
			window = trackIds;
			rebuild();
		},
	};
}
