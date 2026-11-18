import { describe, expect, it } from 'bun:test';
import { makeAssignment } from './Assignment';
import { makeStateVersion } from './StateVersion';

describe('makeAssignment', () => {
	it('starts out unassigned', () => {
		expect(makeAssignment(makeStateVersion()).assigned()).toBe(false);
	});

	it('is assigned once assigned, and moves the version for anyone waiting on it', () => {
		const version = makeStateVersion();
		const assignment = makeAssignment(version);
		const before = version.current;

		assignment.assign();

		expect(assignment.assigned()).toBe(true);
		expect(version.current).toBeGreaterThan(before);
	});

	it('leaves the version alone when it was already assigned', () => {
		const version = makeStateVersion();
		const assignment = makeAssignment(version);
		assignment.assign();
		const settled = version.current;

		assignment.assign();

		expect(version.current).toBe(settled);
	});
});
