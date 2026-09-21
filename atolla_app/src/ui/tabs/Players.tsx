import Strings from 'atolla_app/src/Strings';
import type { LanguageCode } from 'atolla_core/src/Language';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface PlayersTabViewModel {
	language: LanguageCode;
}

export class PlayersTab extends Component<PlayersTabViewModel> {
	onRender(): void {
		<view accessibilityId='players-tab' accessibilityLabel='players-tab' style={styles.root}>
			<label style={styles.message} value={Strings.playersEmpty()} />
		</view>;
	}
}

const styles = {
	message: new Style<Label>({
		...theme.text.sub,
		textAlign: 'center',
	}),
	root: new Style<View>({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
	}),
};
