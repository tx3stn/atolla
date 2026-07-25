// wiretap serves the JSON API from static fixtures and proxies everything it
// doesn't match (audio streams, artwork) here. ExoPlayer and AVPlayer issue
// ranged requests for seeking, so this must honour HTTP Range — a whole-file
// response breaks scrubbing.
//
// add real files to ./media/audio/<trackId>.mp3 and ./media/images/<id>.jpg
// `default.*` in each folder is used as a fallback for any id.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const MEDIA_DIR = join(import.meta.dir, 'media');
const PORT = Number(process.env.MOCK_MEDIA_PORT ?? 8788);

function firstExisting(candidates: Array<string>): string | null {
	for (const rel of candidates) {
		const abs = join(MEDIA_DIR, rel);
		if (existsSync(abs)) return abs;
	}
	return null;
}

function resolveMediaPath(pathname: string): string | null {
	const audio = pathname.match(/^\/Audio\/([^/]+)\/(?:universal|stream)/);
	if (audio) {
		const id = decodeURIComponent(audio[1]);
		return firstExisting([`audio/${id}.mp3`, `audio/${id}.m4a`, 'audio/default.mp3']);
	}
	const image = pathname.match(/^\/Items\/([^/]+)\/Images\//);
	if (image) {
		const id = decodeURIComponent(image[1]);
		return firstExisting([`images/${id}.jpg`, `images/${id}.png`, 'images/default.jpg']);
	}
	return null;
}

function contentTypeFor(path: string): string {
	if (path.endsWith('.mp3')) return 'audio/mpeg';
	if (path.endsWith('.m4a')) return 'audio/mp4';
	if (path.endsWith('.png')) return 'image/png';
	return 'image/jpeg';
}

Bun.serve({
	fetch(req) {
		const url = new URL(req.url);

		// scrobble / playstate are fire-and-forget POSTs; answer 200 so they don't error
		if (req.method === 'POST' && url.pathname.startsWith('/UserPlayedItems')) {
			return new Response('{}', { headers: { 'content-type': 'application/json' } });
		}

		const path = resolveMediaPath(url.pathname);
		if (!path) {
			return new Response('no media fixture for this path', { status: 404 });
		}

		const file = Bun.file(path);
		const size = file.size;
		const type = contentTypeFor(path);
		const range = req.headers.get('range');

		if (range) {
			const match = range.match(/bytes=(\d*)-(\d*)/);
			let start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
			let end = match?.[2] ? Number.parseInt(match[2], 10) : size - 1;
			if (Number.isNaN(start) || start < 0) start = 0;
			if (Number.isNaN(end) || end >= size) end = size - 1;
			return new Response(file.slice(start, end + 1), {
				headers: {
					'accept-ranges': 'bytes',
					'content-length': String(end - start + 1),
					'content-range': `bytes ${start}-${end}/${size}`,
					'content-type': type,
				},
				status: 206,
			});
		}

		return new Response(file, {
			headers: {
				'accept-ranges': 'bytes',
				'content-length': String(size),
				'content-type': type,
			},
		});
	},
	port: PORT,
});

console.log(`media upstream on http://localhost:${PORT} (serving ${MEDIA_DIR})`);
