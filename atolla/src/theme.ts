// @ts-nocheck
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';

const colors = {
	active: '#2D78CE',
	bg: '#000000',
	bgAccent: '#111a2b',
	bgDeep: '#101828',
	dim: '273244',
	grey: '#98a2b3',
	muted: '#667085',
	overlay: 'rgba(0,0,0,0.6)',
	separator: 'rgba(255,255,255,0.08)',
	toastGlassBg: 'rgba(16,24,40,0.85)',
	white: '#d8dee9',
};

export const theme = {
	borderRadius: 18,
	colors: colors,
	footerHeight: 80,
	scrollPaddingBottom: 80 * 2.4,
	text: {
		display: {
			color: colors.white,
			font: systemBoldFont(28),
			letterSpacing: 0.6,
			paddingBottom: 2,
		},
		main: {
			color: colors.white,
			font: systemFont(16),
			letterSpacing: 0.5,
			paddingBottom: 2,
		},
		mainBold: {
			color: colors.white,
			font: systemBoldFont(16),
			letterSpacing: 0.5,
			paddingBottom: 2,
		},
		mutedHeader: {
			color: colors.grey,
			font: systemBoldFont(18),
			letterSpacing: 0.9,
		},
		sub: {
			color: colors.muted,
			font: systemFont(13),
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

export function scrollPaddingBottom(isFooterVisible: boolean): number {
	return isFooterVisible
		? theme.scrollPaddingBottom + theme.footerHeight
		: theme.scrollPaddingBottom;
}
