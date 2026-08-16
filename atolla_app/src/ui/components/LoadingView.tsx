import Strings from 'atolla_core/src/Strings';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';
import { LoadingSpinner } from '../animations/LoadingSpinner';

export class LoadingView extends Component<Record<string, never>> {
	onRender(): void {
		<layout style={styles.root}>
			<label style={styles.label} value={Strings.loading()} />
			<LoadingSpinner size={24} />
		</layout>;
	}
}

const styles = {
	label: new Style<Label>({
		...theme.text.sub,
		marginBottom: theme.scale(12),
	}),
	root: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'column',
		flexGrow: 1,
		justifyContent: 'center',
		width: '100%',
	}),
};
