import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme } from '../../theme';
import { LoopingArrowSpinner } from './LoopingArrowSpinner';

export class LoadingView extends Component<Record<string, never>> {
	onRender(): void {
		<layout style={styles.root}>
			<label style={styles.label} value={Strings.loading()} />
			<LoopingArrowSpinner size={24} />
		</layout>;
	}
}

const styles = {
	label: new Style<Label>({
		...theme.text.sub,
		marginBottom: 12,
	}),
	root: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'column',
		flexGrow: 1,
		justifyContent: 'center',
		width: '100%',
	}),
};
