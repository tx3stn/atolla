import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import { ConnectivityFab } from './ConnectivityFab';

export interface ViewHeaderViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	title: string;
}

export class ViewHeader extends Component<ViewHeaderViewModel> {
	onRender(): void {
		<view accessibilityId='view-header' accessibilityLabel='view-header' style={styles.root}>
			<view style={styles.leadingFabSlot}>
				<ConnectivityFab
					connectionMode={this.viewModel.connectionMode}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
			</view>
			<view style={styles.titleWrap}>
				<view style={styles.titleContainer}>
					<label style={styles.title} value={this.viewModel.title} />
				</view>
			</view>
		</view>;
	}
}

const styles = {
	leadingFabSlot: new Style<View>({
		alignItems: 'center',
		justifyContent: 'flex-start',
		paddingLeft: 6,
		paddingRight: 6,
		width: 60,
	}),
	root: new Style<View>({
		backgroundColor: theme.colors.transparent,
		flexDirection: 'row',
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		paddingTop: theme.padding.deviceInset,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	title: new Style<Label>({
		...theme.text.display,
		textAlign: 'center',
	}),
	titleContainer: new Style<View>({
		backgroundColor: theme.colors.bgFrosted,
		borderRadius: theme.radius.pill,
		padding: 6,
		paddingLeft: 12,
		paddingRight: 12,
	}),
	titleWrap: new Style<View>({
		alignItems: 'flex-end',
		bottom: 0,
		justifyContent: 'center',
		left: 64,
		paddingRight: 16,
		position: 'absolute',
		right: 0,
		top: theme.padding.deviceInset,
	}),
};
