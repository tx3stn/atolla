export function atollaAudioStart(device: string): boolean;

export function atollaAudioDevices(): string;

export function atollaAudioConfigure(source: string, trackId: string, authHeader: string): boolean;

export function atollaAudioSetPlaying(playing: boolean): void;

export function atollaAudioSeekToMs(positionMs: number): boolean;

export function atollaAudioPositionMs(): number;

export function atollaAudioCurrentTrackId(): string;

export function atollaAudioConsumeEvent(): string;

export function atollaAudioClear(): void;
