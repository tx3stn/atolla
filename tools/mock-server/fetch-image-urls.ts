// throwaway script: download artwork for every album and artist in the mock data
// from a real Jellyfin server, saved as media/images/<mock-id>.jpg.
//
// usage:
//   JELLYFIN_URL=http://your-server:8096 JELLYFIN_TOKEN=your-api-token \
//     bun tools/mock-server/fetch-image-urls.ts

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mockJellyfinAlbums } from '../../atolla/src/__mocks__/Albums';
import { mockJellyfinArtists } from '../../atolla/src/__mocks__/Artists';

const BASE = process.env.JELLYFIN_URL?.replace(/\/$/, '');
const TOKEN = process.env.JELLYFIN_TOKEN;

if (!BASE || !TOKEN) {
	console.error('set JELLYFIN_URL and JELLYFIN_TOKEN');
	process.exit(1);
}

const IMAGES_DIR = join(import.meta.dir, 'media', 'images');
const headers = { 'X-Emby-Token': TOKEN };

type JellyfinItem = {
	AlbumArtist?: string;
	Id: string;
	ImageTags?: { Logo?: string; Primary?: string };
	Name: string;
};

async function searchOne(
	name: string,
	type: 'MusicAlbum' | 'MusicArtist',
	artistName?: string,
): Promise<JellyfinItem | null> {
	const params = new URLSearchParams({
		includeItemTypes: type,
		limit: '5',
		recursive: 'true',
		searchTerm: name,
		sortBy: 'SortName',
	});
	const res = await fetch(`${BASE}/Items?${params}`, { headers });
	if (!res.ok) return null;

	const body = (await res.json()) as { Items: Array<JellyfinItem> };
	const match = body.Items.find((item) => {
		if (item.Name.toLowerCase() !== name.toLowerCase()) return false;
		if (artistName && type === 'MusicAlbum') {
			return item.AlbumArtist?.toLowerCase() === artistName.toLowerCase();
		}
		return true;
	});
	return match ?? body.Items[0] ?? null;
}

async function downloadImage(
	realId: string,
	tag: string,
	destPath: string,
	type: 'Logo' | 'Primary' = 'Primary',
): Promise<boolean> {
	const url = `${BASE}/Items/${realId}/Images/${type}?tag=${tag}&fillWidth=512&quality=90`;
	const res = await fetch(url, { headers });
	if (!res.ok) return false;
	await Bun.write(destPath, res);
	return true;
}

mkdirSync(IMAGES_DIR, { recursive: true });

const tasks: Array<{
	artistName?: string;
	mockId: string;
	name: string;
	type: 'MusicAlbum' | 'MusicArtist';
}> = [
	...mockJellyfinAlbums.map((a) => ({
		artistName: a.AlbumArtist,
		mockId: a.Id,
		name: a.Name,
		type: 'MusicAlbum' as const,
	})),
	...mockJellyfinArtists.map((a) => ({ mockId: a.Id, name: a.Name, type: 'MusicArtist' as const })),
];

let ok = 0;
let missing = 0;

for (const { artistName, mockId, name, type } of tasks) {
	const item = await searchOne(name, type, artistName);
	if (!item?.ImageTags?.Primary) {
		console.log(`  skip  ${mockId}  (${name} — not found or no image)`);
		missing++;
		continue;
	}
	const dest = join(IMAGES_DIR, `${mockId}.jpg`);
	const saved = await downloadImage(item.Id, item.ImageTags.Primary, dest);
	if (saved) {
		console.log(`  saved ${mockId}.jpg  (${name})`);
		ok++;
	} else {
		console.log(`  fail  ${mockId}  (${name})`);
		missing++;
	}

	if (type === 'MusicArtist' && item.ImageTags.Logo) {
		const logoDest = join(IMAGES_DIR, `${mockId}-logo.png`);
		const logoSaved = await downloadImage(item.Id, item.ImageTags.Logo, logoDest, 'Logo');
		if (logoSaved) {
			console.log(`  saved ${mockId}-logo.png  (${name})`);
		} else {
			console.log(`  no logo  ${mockId}  (${name})`);
		}
	}
}

console.log(`\n  done: ${ok} saved, ${missing} skipped/failed`);
