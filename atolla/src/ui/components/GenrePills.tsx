import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Genre } from '../../models/Genre';
import Strings from '../../Strings';
import { theme } from '../../theme';

export interface GenrePillsViewModel {
	accessibilityId: string;
	genres: Array<Genre>;
	onGenreTap: (genre: Genre) => void;
}

export class GenrePills extends Component<GenrePillsViewModel> {
	private readonly genreTapHandlers = new Map<string, () => void>();

	private getGenreTapHandler = (genre: Genre): (() => void) => {
		const existing = this.genreTapHandlers.get(genre.id);
		if (existing) {
			return existing;
		}

		const handler = (): void => {
			this.viewModel.onGenreTap(genre);
		};
		this.genreTapHandlers.set(genre.id, handler);
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
						onTap={this.getGenreTapHandler(genre)}
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
		marginRight: 4,
		marginTop: 4,
		paddingBottom: 8,
		paddingLeft: 14,
		paddingRight: 14,
		paddingTop: 8,
	}),
	pillLabel: new Style<Label>({
		...theme.text.sub,
	}),
	pillsRow: new Style<Layout>({
		flexDirection: 'row',
		flexWrap: 'wrap',
		paddingRight: 8,
		width: '100%',
	}),
	section: new Style<Layout>({
		marginBottom: 16,
		marginLeft: 8,
		marginTop: 30,
		width: '100%',
	}),
	sectionHeader: new Style<Label>({
		...theme.text.mutedHeader,
		margin: 8,
	}),
};
