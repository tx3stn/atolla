import type { CacheWindow } from 'atolla_sync/src/api/generated';
import type { FetchList } from '../FetchList';
import type { Answer } from '../Http';

export interface MediaDeps {
	fetchList: FetchList;
}

const TAKEN = 204;

export function handleMedia(deps: MediaDeps, body: string): Promise<Answer> {
	const window = JSON.parse(body) as CacheWindow;
	deps.fetchList.setWindow(window.trackIds);

	return Promise.resolve({ body: '', status: TAKEN });
}
