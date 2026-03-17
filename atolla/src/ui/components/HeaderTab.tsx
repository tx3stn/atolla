// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import type { HeaderTab } from './HeaderTabs';

interface HomeHeaderViewModel {
	active: boolean;
	onTap: () => void;
	tab: HeaderTab;
}

export class HomeHeaderTab extends Component<HomeHeaderViewModel> {
	onRender() {
		<view
			accessibilityLabel={`header-tab-${this.viewModel.tab}`}
			contentDescription={`header-tab-${this.viewModel.tab}`}
			key={this.viewModel.tab}
			onTap={createReusableCallback(() => {
				this.viewModel.onTap();
			})}
			style={styles.header}
		>
			{/* biome-ignore lint/a11y/noLabelWithoutControl: Valdi native label */}
			<label
				style={this.viewModel.active ? styles.activeTab : styles.nonActiveTab}
				value={this.viewModel.tab}
			/>
		</view>;
	}
}

const styles = {
	activeTab: new Style<Label>({
		...theme.text.main,
		color: theme.colors.active,
	}),
	header: new Style({
		padding: 15,
	}),
	nonActiveTab: new Style<Label>({
		...theme.text.main,
		color: theme.colors.muted,
	}),
};
