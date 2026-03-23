export interface Color {
	hex: string;
}

export interface Palette {
	muted_on_surface: Color;
	on_surface: Color;
	primary: Color;
	surface: Color;
}

export const NEUTRAL_PALETTE: Palette = {
	muted_on_surface: { hex: '#667085' },
	on_surface: { hex: '#d8dee9' },
	primary: { hex: '#d8dee9' },
	surface: { hex: '#111a2b' },
};
