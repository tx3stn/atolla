import { describe, expect, it } from 'bun:test';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';
import { makeQueueOwner, QUEUE_OWNER_KEY } from './QueueOwner';

describe('makeQueueOwner', () => {
	it('owns nothing until something claims it', () => {
		expect(makeQueueOwner(new InMemoryKeyValueStore()).get()).toBeNull();
	});

	it('hands back the account that claimed it', () => {
		const owner = makeQueueOwner(new InMemoryKeyValueStore());

		owner.claim('u1');

		expect(owner.get()).toBe('u1');
	});

	it('lets a later claim take it over', () => {
		const owner = makeQueueOwner(new InMemoryKeyValueStore());

		owner.claim('u1');
		owner.claim('u2');

		expect(owner.get()).toBe('u2');
	});

	it('owns nothing again once cleared', () => {
		const owner = makeQueueOwner(new InMemoryKeyValueStore());

		owner.claim('u1');
		owner.clear();

		expect(owner.get()).toBeNull();
	});

	it('reads back the account a previous process claimed', async () => {
		const store = new InMemoryKeyValueStore();

		makeQueueOwner(store).claim('u1');

		const restarted = makeQueueOwner(store);
		await restarted.load();

		expect(restarted.get()).toBe('u1');
	});

	it('owns nothing when a previous process cleared it', async () => {
		const store = new InMemoryKeyValueStore();
		const owner = makeQueueOwner(store);

		owner.claim('u1');
		owner.clear();

		const restarted = makeQueueOwner(store);
		await restarted.load();

		expect(restarted.get()).toBeNull();
	});

	it('owns nothing when nothing was ever stored', async () => {
		const owner = makeQueueOwner(new InMemoryKeyValueStore());

		await owner.load();

		expect(owner.get()).toBeNull();
	});

	// The account id is not a secret, which is why it is the part that survives a restart.
	it('stores the account id under its own key', async () => {
		const store = new InMemoryKeyValueStore();

		makeQueueOwner(store).claim('u1');

		expect(await store.fetchString(QUEUE_OWNER_KEY)).toBe('u1');
	});

	it('survives a store that cannot be written', () => {
		const owner = makeQueueOwner({
			fetchString: () => Promise.reject(new Error('unreadable')),
			storeString: () => Promise.reject(new Error('unwritable')),
		});

		owner.claim('u1');

		expect(owner.get()).toBe('u1');
	});
});
