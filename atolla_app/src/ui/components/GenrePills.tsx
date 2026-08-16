import type { Genre } from 'atolla_core/src/models/Genre';
import Strings from 'atolla_core/src/Strings';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface GenrePillsViewModel {
	accessibilityId: string;
	genres: Array<Genre>;
	onGenreTap: (genre: Genre) => void;
}

export class GenrePills extends Component<GenrePillsViewModel> {
	private readonly genreTapHandlers = new Map<string, () => void>();

	private getGenreTapHandler = (genreId: string): (() => void) => {
		const existing = this.genreTapHandlers.get(genreId);
		if (existing) {
			return existing;
		}

		const handler = (): void => {
			const genre = this.viewModel.genres.find((candidate) => candidate.id === genreId);
			if (genre) {
				this.viewModel.onGenreTap(genre);
			}
		};
		this.genreTapHandlers.set(genreId, handler);
		return handler;
	};

	onRender(): void {
		if (this.viewModel.genres.length === 0) {
			<layout />;
			return;
		}

		<layout style={styles.section}>
			<label style={styles.sectionHeader} value={Strings.headerGenres()} />
			<layout style={styles.pillsRow}>
				{this.viewModel.genres.map((genre) => (
					<view
						accessibilityId={`${this.viewModel.accessibilityId}-pill-${genre.id}`}
						accessibilityLabel={`${this.viewModel.accessibilityId}-pill-${genre.id}`}
						key={genre.id}
						onTap={this.getGenreTapHandler(genre.id)}
						style={styles.pill}
					>
						<label style={styles.pillLabel} value={genre.name} />
					</view>
				))}
			</layout>
		</layout>;
	}
}

const styles = {
	pill: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgRaised,
		borderRadius: theme.radius.pill,
		borderWidth: 1,
		justifyContent: 'center',
		marginRight: theme.scale(4),
		marginTop: theme.scale(4),
		paddingBottom: theme.scale(8),
		paddingLeft: theme.scale(14),
		paddingRight: theme.scale(14),
		paddingTop: theme.scale(8),
	}),
	pillLabel: new Style<Label>({
		...theme.text.sub,
	}),
	pillsRow: new Style<Layout>({
		flexDirection: 'row',
		flexWrap: 'wrap',
		paddingRight: theme.scale(8),
		width: '100%',
	}),
	section: new Style<Layout>({
		marginBottom: theme.scale(16),
		marginLeft: theme.scale(8),
		marginTop: theme.scale(30),
		width: '100%',
	}),
	sectionHeader: new Style<Label>({
		...theme.text.mutedHeader,
		margin: theme.scale(8),
	}),
};
