import { type ConnectionMode, ConnectionModes } from '../transports/Model';

export interface ReconnectTriggerInput {
	inFlight: boolean;
	mode: ConnectionMode;
	reachable: boolean;
	wasReachable: boolean;
}

// a reconnect sync should fire only on a genuine offline->online network transition while the app is
// in online mode and no sync is already running, so regaining the radio drains the scrobble/playlist
// queues the same way a manual mode toggle does, without re-firing on every reachability ping
export function shouldTriggerReconnectSync(input: ReconnectTriggerInput): boolean {
	return (
		input.reachable &&
		!input.wasReachable &&
		input.mode === ConnectionModes.online &&
		!input.inFlight
	);
}
