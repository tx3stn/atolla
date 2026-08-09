import { describe, expect, it } from 'bun:test';
import {
	deriveArtworkWidthFraction,
	deriveGestureScale,
	deriveHeroScale,
	deriveNavScale,
	derivePlayerScale,
	deriveUiScale,
} from './UiScale';

// the scale exists to make a tablet readable, so no phone may move a single point
describe('deriveUiScale on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`stays exactly 1 at ${width}pt`, () => {
			expect(deriveUiScale(width)).toBe(1);
		});
	}
});

describe('deriveUiScale on tablet widths', () => {
	it('scales up once past the widest phone', () => {
		expect(deriveUiScale(744)).toBeGreaterThan(1);
		expect(deriveUiScale(800)).toBeGreaterThan(deriveUiScale(744));
		expect(deriveUiScale(834)).toBeGreaterThan(deriveUiScale(800));
	});

	// past the tuning width the scale holds rather than inflating text on ever wider screens
	it('stops growing past the tablet width', () => {
		expect(deriveUiScale(1024)).toBe(deriveUiScale(834));
		expect(deriveUiScale(2048)).toBe(deriveUiScale(834));
	});
});

describe('deriveUiScale with an unusable width', () => {
	it('falls back to unscaled rather than collapsing every size', () => {
		expect(deriveUiScale(0)).toBe(1);
		expect(deriveUiScale(Number.NaN)).toBe(1);
		expect(deriveUiScale(-100)).toBe(1);
	});
});

describe('deriveGestureScale on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`stays exactly 1 at ${width}pt`, () => {
			expect(deriveGestureScale(width)).toBe(1);
		});
	}
});

describe('deriveGestureScale on tablet widths', () => {
	it('grows with the window', () => {
		expect(deriveGestureScale(744)).toBeGreaterThan(1);
		expect(deriveGestureScale(800)).toBeGreaterThan(deriveGestureScale(744));
		expect(deriveGestureScale(834)).toBeGreaterThan(deriveGestureScale(800));
	});

	// the whole reason this ramp is separate: a swipe that grew with the row it acts on would be an
	// unreasonably long drag, so it must stay well below the interface scale
	it('grows far less than the interface around it', () => {
		expect(deriveGestureScale(834)).toBeLessThan(deriveUiScale(834));
		expect(deriveGestureScale(834)).toBeLessThan(1.2);
	});

	it('stops growing past the tablet width', () => {
		expect(deriveGestureScale(1024)).toBe(deriveGestureScale(834));
		expect(deriveGestureScale(2048)).toBe(deriveGestureScale(834));
	});
});

describe('deriveGestureScale with an unusable width', () => {
	it('falls back to unscaled rather than collapsing the swipe threshold', () => {
		expect(deriveGestureScale(0)).toBe(1);
		expect(deriveGestureScale(Number.NaN)).toBe(1);
		expect(deriveGestureScale(-100)).toBe(1);
	});
});

describe('deriveNavScale on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`stays exactly 1 at ${width}pt`, () => {
			expect(deriveNavScale(width)).toBe(1);
		});
	}
});

describe('deriveNavScale on tablet widths', () => {
	it('grows with the window', () => {
		expect(deriveNavScale(744)).toBeGreaterThan(1);
		expect(deriveNavScale(834)).toBeGreaterThan(deriveNavScale(744));
	});

	// the header and footer are furniture around the content, not content: they grow enough to stay
	// comfortable targets but must not eat the screen the way a fully scaled bar does
	it('grows far less than the interface it frames', () => {
		expect(deriveNavScale(834)).toBeLessThan(deriveUiScale(834));
		expect(deriveNavScale(834)).toBeLessThan(1.25);
	});

	it('stops growing past the tablet width', () => {
		expect(deriveNavScale(1024)).toBe(deriveNavScale(834));
		expect(deriveNavScale(2048)).toBe(deriveNavScale(834));
	});
});

describe('deriveNavScale with an unusable width', () => {
	it('falls back to unscaled rather than collapsing the bars', () => {
		expect(deriveNavScale(0)).toBe(1);
		expect(deriveNavScale(Number.NaN)).toBe(1);
		expect(deriveNavScale(-100)).toBe(1);
	});
});

describe('derivePlayerScale on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`stays exactly 1 at ${width}pt`, () => {
			expect(derivePlayerScale(width)).toBe(1);
		});
	}
});

describe('derivePlayerScale on tablet widths', () => {
	it('grows with the window', () => {
		expect(derivePlayerScale(744)).toBeGreaterThan(1);
		expect(derivePlayerScale(834)).toBeGreaterThan(derivePlayerScale(744));
	});

	// the expanded player has to fit artwork, meta, progress and controls in one screen, so its type
	// and controls grow far less than list content that is only ever read a row at a time
	it('grows far less than the interface around it', () => {
		expect(derivePlayerScale(834)).toBeLessThan(deriveUiScale(834));
		expect(derivePlayerScale(834)).toBeLessThan(1.25);
	});

	it('stops growing past the tablet width', () => {
		expect(derivePlayerScale(1024)).toBe(derivePlayerScale(834));
		expect(derivePlayerScale(2048)).toBe(derivePlayerScale(834));
	});
});

describe('derivePlayerScale with an unusable width', () => {
	it('falls back to unscaled rather than collapsing the controls', () => {
		expect(derivePlayerScale(0)).toBe(1);
		expect(derivePlayerScale(Number.NaN)).toBe(1);
		expect(derivePlayerScale(-100)).toBe(1);
	});
});

describe('deriveHeroScale on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`stays exactly 1 at ${width}pt`, () => {
			expect(deriveHeroScale(width)).toBe(1);
		});
	}
});

describe('deriveHeroScale on tablet widths', () => {
	it('grows with the window', () => {
		expect(deriveHeroScale(744)).toBeGreaterThan(1);
		expect(deriveHeroScale(834)).toBeGreaterThan(deriveHeroScale(744));
	});

	// the only ramp that outpaces the interface: artwork and logos exist to use the extra canvas,
	// where everything else exists to stay legible on it
	it('grows faster than the interface around it', () => {
		expect(deriveHeroScale(834)).toBeGreaterThan(deriveUiScale(834));
	});

	it('stops growing past the tablet width', () => {
		expect(deriveHeroScale(1024)).toBe(deriveHeroScale(834));
		expect(deriveHeroScale(2048)).toBe(deriveHeroScale(834));
	});
});

describe('deriveHeroScale with an unusable width', () => {
	it('falls back to unscaled rather than collapsing the artwork', () => {
		expect(deriveHeroScale(0)).toBe(1);
		expect(deriveHeroScale(Number.NaN)).toBe(1);
		expect(deriveHeroScale(-100)).toBe(1);
	});
});

describe('deriveArtworkWidthFraction on phone widths', () => {
	const phoneWidths = [320, 360, 375, 390, 393, 402, 411, 430, 440];

	for (const width of phoneWidths) {
		it(`keeps the full width at ${width}pt`, () => {
			expect(deriveArtworkWidthFraction(width)).toBe(1);
		});
	}
});

describe('deriveArtworkWidthFraction on tablet widths', () => {
	it('gives back more of the window the wider it gets', () => {
		expect(deriveArtworkWidthFraction(744)).toBeLessThan(1);
		expect(deriveArtworkWidthFraction(800)).toBeLessThan(deriveArtworkWidthFraction(744));
		expect(deriveArtworkWidthFraction(834)).toBeLessThan(deriveArtworkWidthFraction(800));
	});

	// the artwork is the point of the surface, so the ramp has to stop well short of shrinking it
	// into a thumbnail on a wide screen
	it('stops shrinking past the tablet width', () => {
		expect(deriveArtworkWidthFraction(1024)).toBe(deriveArtworkWidthFraction(834));
		expect(deriveArtworkWidthFraction(2048)).toBe(deriveArtworkWidthFraction(834));
		expect(deriveArtworkWidthFraction(2048)).toBeGreaterThan(0.5);
	});

	// a 16:10 tablet leaves enough height that the height cap lands at almost the full width, which
	// is what sent the artwork edge to edge on Android; the width cap has to bite well before that
	it('caps the artwork below the height a tall tablet leaves for it', () => {
		const windowWidth = 800;
		const heightLeftForArtwork = 788;

		expect(windowWidth * deriveArtworkWidthFraction(windowWidth)).toBeLessThan(
			heightLeftForArtwork,
		);
	});
});

describe('deriveArtworkWidthFraction with an unusable width', () => {
	it('falls back to the full width rather than shrinking the artwork', () => {
		expect(deriveArtworkWidthFraction(0)).toBe(1);
		expect(deriveArtworkWidthFraction(Number.NaN)).toBe(1);
		expect(deriveArtworkWidthFraction(-100)).toBe(1);
	});
});
