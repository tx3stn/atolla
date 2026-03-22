export interface Color {
	hex: string;
}

export interface Palette {
	on_surface: Color;
	primary: Color;
	surface: Color;
}

export const NEUTRAL_PALETTE: Palette = {
	on_surface: { hex: '#d8dee9' },
	primary: { hex: '#d8dee9' },
	surface: { hex: '#111a2b' },
};
