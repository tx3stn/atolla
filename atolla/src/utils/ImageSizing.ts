// album art is requested at one of a few fixed sizes rather than a figure derived per device: the
// server resizes and caches per requested size, so a continuous value would spread installs across
// their own set of derived images. the smallest is what every phone already asks for, so no phone
// fetches more than it does today
const ALBUM_ART_MAX_DIMENSIONS = [1280, 1600, 2048];

const SMALLEST_ALBUM_ART_MAX_DIMENSION = ALBUM_ART_MAX_DIMENSIONS[0];
const LARGEST_ALBUM_ART_MAX_DIMENSION =
	ALBUM_ART_MAX_DIMENSIONS[ALBUM_ART_MAX_DIMENSIONS.length - 1];

export function deriveAlbumArtMaxDimension(displayPoints: number, displayScale: number): number {
	if (
		!Number.isFinite(displayPoints) ||
		!Number.isFinite(displayScale) ||
		displayPoints <= 0 ||
		displayScale <= 0
	) {
		return SMALLEST_ALBUM_ART_MAX_DIMENSION;
	}

	const pixels = displayPoints * displayScale;

	return ALBUM_ART_MAX_DIMENSIONS.find((size) => size >= pixels) ?? LARGEST_ALBUM_ART_MAX_DIMENSION;
}
