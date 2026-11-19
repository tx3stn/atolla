import Strings from 'atolla_app/src/Strings';
import type { LanguageCode } from 'atolla_core/src/Language';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Label, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { LidarrConnection } from '../../integrations/lidarr/Connection';
import { theme } from '../../theme';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { IntegrationConnectModal } from '../modals/IntegrationConnectModal';
import { Toggle } from './Toggle';

export interface IntegrationsSectionViewModel {
	animationsEnabled: boolean;
	language: LanguageCode;
	lidarr: LidarrConnection;
	modalSlot: DetachedSlot;
}

interface IntegrationsSectionState {
	revision: number;
}

export class IntegrationsSection extends StatefulComponent<
	IntegrationsSectionViewModel,
	IntegrationsSectionState
> {
	state: IntegrationsSectionState = { revision: 0 };

	onCreate(): void {
		this.registerDisposable(this.viewModel.lidarr.subscribe(this.bump));
	}

	onRender(): void {
		<view>
			<label style={styles.sectionTitle} value={Strings.settingsSectionIntegrations()} />
			<view style={styles.section}>
				<view style={styles.settingRow}>
					<label style={styles.settingLabel} value={Strings.settingsLidarr()} />
					<Toggle
						accessibilityId='settings-lidarr-toggle'
						enabled={this.viewModel.lidarr.connected() !== null}
						onToggle={this.handleLidarrToggle}
					/>
				</view>
			</view>
		</view>;
	}

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private handleClose = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleLidarrConnect = (url: string, apiKey: string): Promise<void> => {
		return this.viewModel.lidarr.connect(url, apiKey);
	};

	private handleLidarrToggle = (enabled: boolean): void => {
		const { animationsEnabled, lidarr, modalSlot } = this.viewModel;
		if (!enabled) {
			void lidarr.disconnect();
			return;
		}

		openSlot(modalSlot, () => {
			<IntegrationConnectModal
				animationsEnabled={animationsEnabled}
				name={Strings.settingsLidarr()}
				onCancel={this.handleClose}
				onConnect={this.handleLidarrConnect}
				url={lidarr.savedUrl()}
			/>;
		});
	};
}

const styles = {
	section: new Style<View>({
		marginBottom: theme.scale(16),
		marginTop: theme.scale(8),
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mutedHeader,
		letterSpacing: 1,
		marginBottom: theme.scale(4),
		marginLeft: theme.scale(4),
		marginRight: theme.scale(4),
		marginTop: theme.scale(4),
	}),
	settingLabel: new Style<Label>({
		...theme.text.sub,
		flexBasis: 0,
		flexGrow: 1,
		marginLeft: theme.scale(4),
	}),
	settingRow: new Style<View>({
		alignItems: 'center',
		flexDirection: 'row',
		marginBottom: theme.scale(8),
	}),
};
