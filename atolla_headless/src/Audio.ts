// The surface the ExoPlayer and AVQueuePlayer engines already implement, minus what only a phone
// needs. Events are drained as strings rather than delivered, so nothing calls into JavaScript
// from the bus thread.
export type AudioDevices = () => Array<string>;

export interface AudioEngine {
	clear: () => void;
	// authHeader travels with the source because it belongs to whichever account owns the queue.
	configure: (source: string, trackId: string, authHeader: string) => boolean;
	consumeEvent: () => string;
	currentTrackId: () => string;
	positionMs: () => number;
	seekToMs: (positionMs: number) => boolean;
	setPlaying: (playing: boolean) => void;
	start: (device: string) => boolean;
}
