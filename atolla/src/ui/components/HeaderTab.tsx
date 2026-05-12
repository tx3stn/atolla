import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import type { HeaderTab } from './HeaderTabs';

interface LibraryHeaderViewModel {
	active: boolean;
	onTap: () => void;
	tab: HeaderTab;
}

export class LibraryHeaderTab extends Component<LibraryHeaderViewModel> {
	onRender() {
		<view style={styles.tabWrap}>
			<view
				accessibilityId={`header-tab-${this.viewModel.tab.toLowerCase()}`}
				accessibilityLabel={`header-tab-${this.viewModel.tab.toLowerCase()}`}
				key={this.viewModel.tab}
				onTap={createReusableCallback(() => {
					this.viewModel.onTap();
				})}
				style={this.viewModel.active ? styles.headerActive : styles.header}
			>
				{this.viewModel.active && (
					<image src={res.headertabgradient} style={styles.activeGradient} />
				)}
				<label
					style={this.viewModel.active ? styles.activeTab : styles.nonActiveTab}
					value={this.viewModel.tab}
				/>
			</view>
		</view>;
	}
}

const styles = {
	activeGradient: new Style<View>({
		borderRadius: 999,
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
		borderRadius: 999,
		flexGrow: 0,
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
		borderRadius: 999,
		flexGrow: 0,
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
	nonActiveTab: new Style<Label>({
		...theme.text.mainMuted,
		color: theme.colors.grey,
		textAlign: 'center',
	}),
	tabWrap: new Style({
		marginRight: 4,
	}),
};
