// In-memory playlist state for the mock server.
//
// wiretap serves the static playlist fixtures (playlist-1..6) directly. Everything it can't
// match — a freshly created playlist and any add / move / remove mutation — falls through to
// this Bun upstream. Static mocks are stateless, so we hold just enough state here for the
// real LiveTransport write path to create a playlist, add tracks and read its own writes back
// (create-from-queue), and for an optimistic reorder to succeed instead of erroring.

import { mockJellyfinTracks } from '../../atolla/src/__mocks__/Albums';
import type { JellyfinTrackItem } from '../../atolla/src/models/jellyfin/Types';

interface CreatedPlaylist {
	name: string;
	trackIds: Array<string>;
}

const tracksById = new Map<string, JellyfinTrackItem>(
	mockJellyfinTracks.map((track) => [track.Id, track]),
);

// created playlist id -> its running order of track ids
const createdPlaylists = new Map<string, CreatedPlaylist>();
let nextPlaylistId = 1;

const ITEMS_PATH = /^\/Playlists\/([^/]+)\/Items$/;
const MOVE_PATH = /^\/Playlists\/([^/]+)\/Items\/([^/]+)\/Move\/(\d+)$/;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json' },
		status,
	});
}

// the LiveTransport keys the playlist entry (PlaylistItemId) to the track id, so a reorder /
// remove addresses tracks by their own id — mirror that here.
function playlistTrackDtos(trackIds: ReadonlyArray<string>): Array<JellyfinTrackItem> {
	const dtos: Array<JellyfinTrackItem> = [];
	for (const id of trackIds) {
		const track = tracksById.get(id);
		if (track) dtos.push({ ...track, PlaylistItemId: id });
	}
	return dtos;
}

async function readCreateBody(req: Request): Promise<CreatedPlaylist> {
	try {
		const body = (await req.json()) as { Ids?: Array<string>; Name?: string };
		return {
			name: typeof body.Name === 'string' ? body.Name : 'Mock Playlist',
			trackIds: Array.isArray(body.Ids) ? body.Ids : [],
		};
	} catch {
		return { name: 'Mock Playlist', trackIds: [] };
	}
}

function addTracks(playlistId: string, trackIds: ReadonlyArray<string>): void {
	// adding to an existing static playlist keeps no state (its read-back is static); the app
	// only needs the write to succeed.
	const playlist = createdPlaylists.get(playlistId);
	if (playlist) playlist.trackIds = [...playlist.trackIds, ...trackIds];
}

function removeTracks(playlistId: string, entryIds: ReadonlyArray<string>): void {
	const playlist = createdPlaylists.get(playlistId);
	if (!playlist) return;
	const remove = new Set(entryIds);
	playlist.trackIds = playlist.trackIds.filter((id) => !remove.has(id));
}

function applyMove(playlistId: string, entryId: string, toIndex: number): void {
	const playlist = createdPlaylists.get(playlistId);
	if (!playlist) return;
	const from = playlist.trackIds.indexOf(entryId);
	if (from === -1) return;
	const next = [...playlist.trackIds];
	const [moved] = next.splice(from, 1);
	next.splice(toIndex, 0, moved);
	playlist.trackIds = next;
}

// Returns a Response for playlist create / read / mutate requests, or null when the request
// isn't one (so the caller falls through to media / search handling).
export async function handlePlaylistRequest(req: Request, url: URL): Promise<Response | null> {
	const { pathname } = url;
	const { method } = req;

	if (method === 'POST' && pathname === '/Playlists') {
		const id = `mock-playlist-${nextPlaylistId++}`;
		createdPlaylists.set(id, await readCreateBody(req));
		return json({ Id: id });
	}

	// getItem for a created playlist (known ids are served statically by wiretap and never
	// reach us); anything else — including image sub-paths — falls through to the media handler.
	if (method === 'GET' && pathname.startsWith('/Items/')) {
		const id = decodeURIComponent(pathname.slice('/Items/'.length));
		const playlist = createdPlaylists.get(id);
		if (!playlist) return null;
		const dtos = playlistTrackDtos(playlist.trackIds);
		return json({
			ChildCount: dtos.length,
			Id: id,
			MediaType: 'Audio',
			Name: playlist.name,
			RunTimeTicks: dtos.reduce((sum, track) => sum + (track.RunTimeTicks ?? 0), 0),
			Type: 'Playlist',
		});
	}

	// move always succeeds: the app optimistically reorders its own list and only reverts on a
	// failed request, so a static (existing) playlist reorders visually without any state here.
	const move = pathname.match(MOVE_PATH);
	if (method === 'POST' && move) {
		applyMove(move[1], decodeURIComponent(move[2]), Number.parseInt(move[3], 10));
		return json({});
	}

	const items = pathname.match(ITEMS_PATH);
	if (items) {
		const playlistId = items[1];

		if (method === 'POST') {
			const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
			addTracks(playlistId, ids);
			return json({});
		}

		if (method === 'DELETE') {
			const entryIds = (url.searchParams.get('entryIds') ?? '').split(',').filter(Boolean);
			removeTracks(playlistId, entryIds);
			return json({});
		}

		if (method === 'GET') {
			// existing playlists are served statically by wiretap; only created ones reach us.
			const playlist = createdPlaylists.get(playlistId);
			if (!playlist) return null;
			const startIndex = Number.parseInt(url.searchParams.get('startIndex') ?? '0', 10) || 0;
			const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
			const all = playlistTrackDtos(playlist.trackIds);
			const page = Number.isNaN(limit)
				? all.slice(startIndex)
				: all.slice(startIndex, startIndex + limit);
			return json({ Items: page, StartIndex: startIndex, TotalRecordCount: all.length });
		}
	}

	return null;
}
