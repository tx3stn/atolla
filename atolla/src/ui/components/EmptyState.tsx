import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface EmptyStateViewModel {
	hasMore: boolean;
	isOfflineMode: boolean;
	itemCount: number;
	message: string;
}

export class EmptyState extends Component<EmptyStateViewModel> {
	onRender(): void {
		const { hasMore, isOfflineMode, itemCount, message } = this.viewModel;
		if (!isOfflineMode || itemCount > 0 || hasMore) {
			return;
		}

		<view
			accessibilityId='library-empty-state'
			accessibilityLabel='library-empty-state'
			style={styles.overlay}
		>
			<label style={styles.message} value={message} />
		</view>;
	}
}

const styles = {
	message: new Style<Label>({
		...theme.text.sub,
		textAlign: 'center',
	}),
	overlay: new Style<View>({
		alignItems: 'center',
		bottom: 0,
		justifyContent: 'center',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
};
