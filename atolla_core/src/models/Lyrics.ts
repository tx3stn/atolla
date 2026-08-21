export interface LyricLine {
	startSeconds?: number;
	text: string;
}

export interface Lyrics {
	lines: Array<LyricLine>;
	synced: boolean;
}
