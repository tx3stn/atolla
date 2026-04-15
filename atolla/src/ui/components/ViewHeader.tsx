// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import type { ConnectionMode } from '../../transports/Model';
import { ConnectivityFab } from './ConnectivityFab';

export interface ViewHeaderViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	title: string;
}

export class ViewHeader extends Component<ViewHeaderViewModel> {
	onRender(): void {
		<view accessibilityLabel='view-header' contentDescription='view-header' style={styles.root}>
			<view style={styles.leadingFabSlot}>
				<ConnectivityFab
					connectionMode={this.viewModel.connectionMode}
					downloadingCount={this.viewModel.downloadingCount}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
			</view>
			<view style={styles.titleWrap}>
				<label style={styles.title} value={this.viewModel.title} />
			</view>
		</view>;
	}
}

const styles = {
	leadingFabSlot: new Style({
		alignItems: 'center',
		justifyContent: 'flex-start',
		paddingLeft: 6,
		paddingRight: 6,
		width: 60,
	}),
	root: new Style({
		backgroundColor: theme.colors.transparent,
		flexDirection: 'row',
		left: 0,
		minHeight: theme.headerHeight,
		paddingBottom: 4,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 10,
	}),
	title: new Style<Label>({
		...theme.text.display,
		backgroundColor: theme.colors.bgFrosted,
		borderRadius: 999,
		padding: 12,
		textAlign: 'center',
	}),
	titleWrap: new Style({
		alignItems: 'flex-end',
		bottom: 0,
		justifyContent: 'center',
		left: 64,
		paddingRight: 16,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
};
