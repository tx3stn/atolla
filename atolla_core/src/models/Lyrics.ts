export interface LyricLine {
	startSeconds?: number;
	text: string;
}

export interface Lyrics {
	lines: Array<LyricLine>;
	synced: boolean;
}

// -1 means no line is active yet: the pre-roll before the first timestamp, or lyrics with no
// timing at all. Lines arrive in order from the mapper, so this is a scan rather than a search.
export function activeLineIndex(lines: Array<LyricLine>, seconds: number): number {
	let active = -1;
	for (let index = 0; index < lines.length; index++) {
		const startSeconds = lines[index]?.startSeconds;
		if (startSeconds === undefined) {
			continue;
		}
		if (startSeconds > seconds) {
			break;
		}
		active = index;
	}
	return active;
}
