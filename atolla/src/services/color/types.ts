export interface Color {
	hex: string;
}

export interface Palette {
	accent: Color;
	muted_on_surface: Color;
	on_surface: Color;
	primary: Color;
	surface: Color;
}

export const NEUTRAL_PALETTE: Palette = {
	accent: { hex: '#3b82f6' },
	muted_on_surface: { hex: '#667085' },
	on_surface: { hex: '#d8dee9' },
	primary: { hex: '#d8dee9' },
	surface: { hex: '#111a2b' },
};
