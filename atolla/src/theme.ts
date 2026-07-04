import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';

const isAndroid = Device.isAndroid();

const colors = {
	active: '#2D78CE',
	bg: '#000000',
	bgAccent: '#111a2b',
	bgDeep: '#101828',
	bgDim: '#0b1320',
	bgFrosted: 'rgba(0,0,0,0.8)',
	bgRaised: '#151515',
	destructive: '#ef4444',
	grey: '#98a2b3',
	muted: '#667085',
	pureWhite: '#ffffff',
	separator: 'rgba(255,255,255,0.08)',
	toastGlassBg: 'rgba(16,24,40,0.85)',
	transparent: 'rgba(0,0,0,0)',
	warning: '#f5a623',
	white: '#d8dee9',
};

export const paletteDefaults = {
	accent: colors.active,
	mutedOnSurface: colors.muted,
	onSurface: colors.white,
	surface: colors.bgAccent,
} as const;

const headerAndFooter = 52;
const topInset = Device.getDisplayTopInset();

export const theme = {
	app: {
		content: new Style({
			alignItems: 'center' as const,
			flexGrow: 1,
			justifyContent: 'flex-start' as const,
			position: 'relative' as const,
			width: '100%',
		}),
		root: new Style({
			backgroundColor: colors.bg,
			flexDirection: 'column' as const,
			height: '100%',
			position: 'relative' as const,
			width: '100%',
		}),
	},
	colors: colors,
	footerHeight: headerAndFooter,
	headerHeight: headerAndFooter,
	modalBackdropColor: isAndroid ? 'rgba(0,0,0,0.72)' : colors.transparent,
	modalBlurStyle: 'regular',
	padding: {
		deviceInset: topInset,
		headerTop: topInset + 16,
		pill: 14,
		scrollBottom: 180,
		scrollHeader: (isVisible: boolean | null) => {
			if (isVisible == null) {
				return headerAndFooter + topInset;
			}

			if (!isVisible) {
				return topInset + 8;
			}

			return headerAndFooter + topInset + 16;
		},
	},
	radius: {
		card: 6,
		default: 18,
		pill: 999,
	},
	shadow: {
		// floating overlays: now playing surface
		floating: '0 10 18 rgba(0,0,0,0.35)',
		// small controls: the progress playhead
		playhead: '0 1 2 rgba(0,0,0,0.25)',
		// raised surfaces: toasts, banners
		raised: `0 6 12 ${colors.bg}`,
	},
	text: {
		display: {
			color: colors.white,
			font: systemBoldFont(28),
			letterSpacing: 1,
			paddingBottom: 2,
		},
		main: {
			color: colors.white,
			font: systemFont(16),
			letterSpacing: 0.7,
			paddingBottom: 2,
		},
		mainBold: {
			color: colors.white,
			font: systemBoldFont(16),
			letterSpacing: 0.7,
			paddingBottom: 2,
		},
		mainMuted: {
			color: colors.grey,
			font: systemBoldFont(16),
			letterSpacing: 0.9,
			paddingBottom: 2,
		},
		mutedHeader: {
			color: colors.grey,
			font: systemBoldFont(18),
			letterSpacing: 0.9,
		},
		sub: {
			color: colors.muted,
			font: systemFont(14),
		},
		subLarger: {
			color: colors.muted,
			font: systemFont(16),
		},
		title: {
			color: colors.white,
			font: systemBoldFont(18),
			letterSpacing: 0.6,
			paddingBottom: 2,
		},
	},
} as const;

export function withAlpha(hexColor: string, alpha: number): string {
	const hex = hexColor.replace('#', '');
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	const normalizedAlpha = Math.max(0, Math.min(1, alpha));
	return `rgba(${r},${g},${b},${normalizedAlpha})`;
}
