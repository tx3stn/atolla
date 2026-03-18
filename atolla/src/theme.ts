// @ts-nocheck
import { systemBoldFont, systemFont } from 'valdi_core/src/SystemFont';

const colors = {
	active: '#3b82f6',
	bg: '#000000',
	bgAccent: '#111a2b',
	dim: '273244',
	grey: '#98a2b3',
	muted: '#667085',
	white: '#d8dee9',
};

export const theme = {
	borderRadius: 12,
	colors: colors,
	footerHeight: 80,
	text: {
		main: {
			color: colors.white,
			font: systemFont(15),
			letterSpacing: 0.5,
			paddingBottom: 2,
		},
		mainBold: {
			color: colors.white,
			font: systemBoldFont(15),
			letterSpacing: 0.5,
			paddingBottom: 2,
		},
		sub: {
			color: colors.muted,
			font: systemFont(13),
		},
		title: {
			color: colors.white,
			font: systemBoldFont(18),
			letterSpacing: 0.6,
			paddingBottom: 2,
		},
	},
} as const;
