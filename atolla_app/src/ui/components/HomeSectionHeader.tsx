import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface HomeSectionHeaderViewModel {
	accessibilityId: string;
	onLongPress?: () => void;
	title: string;
}

export class HomeSectionHeader extends Component<HomeSectionHeaderViewModel> {
	onRender(): void {
		const { accessibilityId, onLongPress, title } = this.viewModel;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			onLongPress={onLongPress}
			style={styles.header}
		>
			<label style={styles.title} value={title} />
		</view>;
	}
}

const styles = {
	header: new Style<View>({
		width: '100%',
	}),
	title: new Style<Label>({
		...theme.text.mutedHeader,
		marginBottom: theme.scale(8),
	}),
};
