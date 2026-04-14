// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Genre } from '../../models/Genre';
import { theme } from '../../theme';

export interface GenrePillsViewModel {
	accessibilityLabel: string;
	genres: Array<Genre>;
	onGenreTap: (genre: Genre) => void;
}

export class GenrePills extends Component<GenrePillsViewModel> {
	onRender(): void {
		if (this.viewModel.genres.length === 0) {
			<layout />;
			return;
		}

		<layout style={styles.section}>
			<label style={styles.sectionHeader} value='GENRES' />
			<layout style={styles.pillsRow}>
				{this.viewModel.genres.map((genre) => (
					<view
						accessibilityLabel={`${this.viewModel.accessibilityLabel}-pill-${genre.id}`}
						contentDescription={`${this.viewModel.accessibilityLabel}-pill-${genre.id}`}
						onTap={() => {
							this.viewModel.onGenreTap(genre);
						}}
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
	pill: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgRaised,
		borderRadius: 999,
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
	pillsRow: new Style({
		columnGap: 8,
		flexDirection: 'row',
		flexWrap: 'wrap',
		paddingRight: 8,
		rowGap: 8,
		width: '100%',
	}),
	section: new Style({
		marginBottom: 16,
		marginLeft: 8,
		marginTop: 30,
		rowGap: 8,
		width: '100%',
	}),
	sectionHeader: new Style<Label>({
		...theme.text.mutedHeader,
		margin: 8,
	}),
};
