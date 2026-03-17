// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { theme } from '../../theme';

export type SearchViewModel = Record<string, never>;

interface SearchState {
	query: string;
}

export class SearchView extends StatefulComponent<SearchViewModel, SearchState> {
	state: SearchState = {
		query: '',
	};

	onRender(): void {
		<view style={styles.root}>
			<view style={styles.searchBar}>
				<image src={res.search} style={styles.searchIcon} tint={theme.colors.grey} />
				<textfield
					onChange={(text) => {
						this.setState({ query: text });
					}}
					placeholder='Search'
					style={styles.searchInput}
					value={this.state.query}
				/>
			</view>

			{/* Recent searches */}
		</view>;
	}
}

const styles = {
	root: new Style({
		padding: 20,
		width: '100%',
	}),
	searchBar: new Style({
		alignItems: 'center',
		borderColor: theme.colors.muted,
		borderRadius: 999,
		borderWidth: 2,
		flexDirection: 'row',
		padding: 18,
	}),
	searchIcon: new Style({
		height: 20,
		marginRight: 8,
		width: 20,
	}),
	searchInput: new Style({
		...theme.text.main,
		flexGrow: 1,
	}),
};
