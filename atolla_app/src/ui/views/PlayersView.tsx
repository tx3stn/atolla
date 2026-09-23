import Strings from 'atolla_app/src/Strings';
import type { LanguageCode } from 'atolla_core/src/Language';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Player } from '../../models/Player';
import type { PlayersStore } from '../../stores/Players';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import { Button } from '../components/Button';
import { HomeSectionHeader } from '../components/HomeSectionHeader';
import { PlayerCard } from '../components/PlayerCard';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { AddPlayerModal } from '../modals/AddPlayerModal';

export interface PlayersViewModel {
	language: LanguageCode;
	modalSlot: DetachedSlot;
	playersStore: PlayersStore;
	preferences: Preferences;
}

interface PlayersViewState {
	revision: number;
}

export class PlayersView extends StatefulComponent<PlayersViewModel, PlayersViewState> {
	state: PlayersViewState = { revision: 0 };

	onCreate(): void {
		this.registerDisposable(this.viewModel.playersStore.subscribe(this.bump));
	}

	onRender(): void {
		const sections = this.viewModel.playersStore.sections();
		const deviceName = this.viewModel.preferences.jellyfinClientDeviceName;
		const showGroupHeaders = sections.length > 1;

		<layout style={styles.root}>
			<scroll style={styles.scroll}>
				<view
					accessibilityId='players-view'
					accessibilityLabel='players-view'
					style={styles.content}
				>
					{sections.length === 0 && (
						<view
							accessibilityId='players-empty'
							accessibilityLabel='players-empty'
							style={styles.empty}
						>
							<label style={styles.emptyLabel} value={Strings.playersEmpty()} />
						</view>
					)}
					{sections.map((section) => (
						<layout key={section.group} style={styles.section}>
							{showGroupHeaders && (
								<HomeSectionHeader
									accessibilityId={`players-group-${section.group}`}
									title={section.group.toUpperCase()}
								/>
							)}
							{section.players.map((player) => (
								<layout key={player.id} style={styles.cardSlot}>
									<PlayerCard
										onToggle={createReusableCallback((enabled: boolean) => {
											this.viewModel.playersStore.setEnabled(player.id, enabled);
										})}
										player={named(player, deviceName)}
									/>
								</layout>
							))}
						</layout>
					))}
					<Button
						accessibilityId='players-add'
						animationsEnabled={this.viewModel.preferences.animationsEnabled}
						label={Strings.playersAddButton()}
						onTap={this.handleAddTap}
					/>
				</view>
			</scroll>
		</layout>;
	}

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private handleAdd = (code: string): Promise<Player> => this.viewModel.playersStore.add(code);

	private handleAddCancel = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleAddTap = (): void => {
		openSlot(this.viewModel.modalSlot, () => {
			<AddPlayerModal
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
				onAdd={this.handleAdd}
				onCancel={this.handleAddCancel}
			/>;
		});
	};
}

function named(player: Player, deviceName: string): Player {
	if (!player.isThisDevice || deviceName === '') {
		return player;
	}
	return { ...player, name: deviceName };
}

const styles = {
	cardSlot: new Style<Layout>({
		marginBottom: theme.scale(12),
		width: '100%',
	}),
	content: new Style<View>({
		marginTop: theme.scale(12),
		paddingLeft: theme.scale(14),
		paddingRight: theme.scale(14),
		width: '100%',
	}),
	empty: new Style<View>({
		alignItems: 'center',
		marginTop: theme.scale(40),
		width: '100%',
	}),
	emptyLabel: new Style<Label>({
		...theme.text.sub,
		textAlign: 'center',
	}),
	root: new Style<Layout>({
		flexGrow: 1,
		width: '100%',
	}),
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(null),
		width: '100%',
	}),
	section: new Style<Layout>({
		marginBottom: theme.scale(24),
		width: '100%',
	}),
};
