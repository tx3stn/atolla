import res from 'atolla/res';
import Strings from 'atolla/src/Strings';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type HeaderTab, HeaderTabs } from '../../models/App';
import { theme } from '../../theme';

interface LibraryHeaderViewModel {
	active: boolean;
	onTap: () => void;
	tab: HeaderTab;
}

export class LibraryHeaderTab extends Component<LibraryHeaderViewModel> {
	onRender() {
		<layout style={styles.tabWrap}>
			<view
				accessibilityId={`header-tab-${this.viewModel.tab.toLowerCase()}`}
				accessibilityLabel={`header-tab-${this.viewModel.tab.toLowerCase()}`}
				key={this.viewModel.tab}
				onTap={createReusableCallback(() => {
					this.viewModel.onTap();
				})}
				style={this.viewModel.active ? styles.headerActive : styles.header}
			>
				<image
					src={res.headertabgradient}
					style={this.viewModel.active ? styles.activeGradient : styles.hiddenGradient}
				/>
				<label
					style={this.viewModel.active ? styles.activeTab : styles.nonActiveTab}
					value={this.getLabel(this.viewModel.tab)}
				/>
			</view>
		</layout>;
	}

	private getLabel = (tab: HeaderTab): string => {
		switch (tab) {
			case HeaderTabs.albums:
				return Strings.headerAlbums();
			case HeaderTabs.artists:
				return Strings.headerArtists();
			case HeaderTabs.genres:
				return Strings.headerGenres();
			case HeaderTabs.playlists:
				return Strings.headerPlaylists();
			default:
				return Strings.unknown();
		}
	};
}

const styles = {
	activeGradient: new Style<View>({
		borderRadius: theme.radius.pill,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	activeTab: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.bg,
		textAlign: 'center',
	}),
	header: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgFrosted,
		borderRadius: theme.radius.pill,
		flexGrow: 0,
		flexShrink: 0,
		justifyContent: 'center',
		minHeight: 25,
		minWidth: 72,
		paddingBottom: 6,
		paddingLeft: 12,
		paddingRight: 12,
		paddingTop: 6,
		position: 'relative',
		slowClipping: true,
	}),
	headerActive: new Style<View>({
		alignItems: 'center',
		borderRadius: theme.radius.pill,
		flexGrow: 0,
		flexShrink: 0,
		justifyContent: 'center',
		minHeight: 25,
		minWidth: 72,
		paddingBottom: 6,
		paddingLeft: 12,
		paddingRight: 12,
		paddingTop: 6,
		position: 'relative',
		slowClipping: true,
	}),
	hiddenGradient: new Style<View>({
		borderRadius: theme.radius.pill,
		bottom: 0,
		left: 0,
		opacity: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	nonActiveTab: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.grey,
		textAlign: 'center',
	}),
	tabWrap: new Style<Layout>({
		flexShrink: 0,
		marginRight: 4,
	}),
};
