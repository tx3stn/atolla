import { describe, expect, it } from 'bun:test';
import { makeStateVersion } from './StateVersion';

const NO_WAIT = 0;
const A_WHILE = 10_000;

describe('makeStateVersion', () => {
	it('starts at the first version', () => {
		expect(makeStateVersion().current).toBe(1);
	});

	it('advances by one on every bump', () => {
		const version = makeStateVersion();

		version.bump();
		version.bump();

		expect(version.current).toBe(3);
	});

	it('answers at once when something newer already exists', async () => {
		const version = makeStateVersion();
		version.bump();

		expect(await version.waitPast(1, A_WHILE)).toBe(2);
	});

	it('answers at once when the caller holds a version this run will never reach', async () => {
		const version = makeStateVersion();

		expect(await version.waitPast(412, A_WHILE)).toBe(1);
	});

	it('waits when the caller is up to date, then answers with what overtook it', async () => {
		const version = makeStateVersion();
		let answered: number | undefined;

		const waiting = version.waitPast(1, A_WHILE).then((v) => {
			answered = v;
		});
		await Promise.resolve();
		expect(answered).toBeUndefined();

		version.bump();
		await waiting;

		expect(answered).toBe(2);
	});

	it('gives the version back unchanged when the wait runs out', async () => {
		const version = makeStateVersion();

		expect(await version.waitPast(1, NO_WAIT)).toBe(1);
	});

	it('wakes every caller waiting on the same version', async () => {
		const version = makeStateVersion();
		const waiting = [version.waitPast(1, A_WHILE), version.waitPast(1, A_WHILE)];

		version.bump();

		expect(await Promise.all(waiting)).toEqual([2, 2]);
	});

	it('leaves a caller waiting whose version the bump did not overtake', async () => {
		const version = makeStateVersion();
		version.bump();
		let answered = false;

		void version.waitPast(2, A_WHILE).then(() => {
			answered = true;
		});
		await Promise.resolve();

		expect(answered).toBe(false);
	});
});
