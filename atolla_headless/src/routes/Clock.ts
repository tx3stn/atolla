import type { Clock } from '../Clock';
import type { Answer } from '../Http';

export interface ClockRouteDeps {
	clock: Pick<Clock, 'reading'>;
}

const UNAVAILABLE = 503;

export async function handleClock(deps: ClockRouteDeps): Promise<Answer> {
	const reading = deps.clock.reading();
	if (reading === null) {
		return { body: '', status: UNAVAILABLE };
	}

	return { body: JSON.stringify(reading), status: 200 };
}
