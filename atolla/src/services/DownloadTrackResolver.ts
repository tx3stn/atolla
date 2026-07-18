import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { Track } from '../models/Track';
import type { Transport } from '../transports/Transport';
import { resolveGenreImageUrls } from '../ui/flows/GenreNavigationResolver';
import { retryResolve } from '../utils/Async';

export interface ResolvedDownloadTrack {
	artistLogoUrl: string | null;
	streamUrl: string;
	track: Track;
}

export interface ResolvedDownloadInputs {
	artists: Array<Artist>;
	resolvedGenres: Array<Genre>;
	tracks: Array<ResolvedDownloadTrack>;
}

export interface DownloadTrackResolverTransport {
	getArtist: Transport['getArtist'];
	getArtistLogoUrl: Transport['getArtistLogoUrl'];
	getGenres: Transport['getGenres'];
	getTrackCacheUrl: Transport['getTrackCacheUrl'];
}

export interface ResolveDownloadTracksOptions {
	existingLogos?: ReadonlyArray<string | null>;
	resolveMissingLogos?: boolean;
}

// turns a list of tracks into the inputs the DownloadService collection methods expect:
// a per-track {streamUrl, artistLogoUrl} plus the collection's resolved artists and
// genre image urls. shared by the playlist/genre download buttons and the sync service.
export async function resolveDownloadTracks(
	transport: DownloadTrackResolverTransport,
	tracks: ReadonlyArray<Track>,
	options: ResolveDownloadTracksOptions = {},
): Promise<ResolvedDownloadInputs> {
	const { existingLogos, resolveMissingLogos = false } = options;

	const resolvedTracks = (
		await Promise.all(
			tracks.map(async (track, index): Promise<ResolvedDownloadTrack | null> => {
				const streamUrl = transport.getTrackCacheUrl(track.id);
				if (!streamUrl) {
					return null;
				}

				const existingLogo = existingLogos?.[index] ?? null;
				if (existingLogo || !resolveMissingLogos || !track.artistId) {
					return { artistLogoUrl: existingLogo, streamUrl, track };
				}

				try {
					const artistLogoUrl = await retryResolve(() =>
						transport.getArtistLogoUrl(track.artistId as string),
					);
					return { artistLogoUrl, streamUrl, track };
				} catch {
					return { artistLogoUrl: null, streamUrl, track };
				}
			}),
		)
	).filter((entry): entry is ResolvedDownloadTrack => entry !== null);

	const uniqueArtistIds = Array.from(
		new Set(
			resolvedTracks
				.map(({ track }) => track.artistId)
				.filter((artistId): artistId is string => artistId != null && artistId.length > 0),
		),
	);
	const allGenres = resolvedTracks.flatMap(({ track }) => track.genres ?? []);

	const [artistResults, resolvedGenres] = await Promise.all([
		Promise.all(
			uniqueArtistIds.map((artistId) =>
				retryResolve(() => transport.getArtist(artistId)).catch(() => null),
			),
		),
		resolveGenreImageUrls(transport, allGenres),
	]);

	return {
		artists: artistResults.filter((artist): artist is Artist => artist != null),
		resolvedGenres,
		tracks: resolvedTracks,
	};
}
