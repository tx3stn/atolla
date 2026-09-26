import Strings from 'atolla_app/src/Strings';
import type { LanguageCode } from 'atolla_core/src/Language';
import { isErrorConst } from 'atolla_core/src/utils/Errors';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ContentSizeChangeEvent, ScrollEvent } from 'valdi_tsx/src/GestureEvents';
import type { Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Player, ProbedPlayer } from '../../models/Player';
import { type ToastService, ToastTypes } from '../../services/ToastService';
import type { PlayersStore } from '../../stores/Players';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import { Button } from '../components/Button';
import { HomeSectionHeader } from '../components/HomeSectionHeader';
import { PlayerCard } from '../components/PlayerCard';
import { ReorderableList, type ReorderableRowHandle } from '../components/ReorderableList';
import { ScrollDragAutoScroller } from '../components/ScrollDragAutoScroller';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { AddPlayerModal } from '../modals/AddPlayerModal';
import { Modal } from '../modals/Modal';

export interface PlayersViewModel {
	language: LanguageCode;
	modalSlot: DetachedSlot;
	playersStore: PlayersStore;
	preferences: Preferences;
	toastService: ToastService;
}

interface PlayersViewState {
	revision: number;
}

export class PlayersView extends StatefulComponent<PlayersViewModel, PlayersViewState> {
	state: PlayersViewState = { revision: 0 };
	private destroyed = false;
	private forgetTarget: Player | null = null;
	private readonly scrollRef = new ElementRef<ScrollView>();
	private readonly dragAutoScroller = new ScrollDragAutoScroller(this.scrollRef);

	onCreate(): void {
		this.registerDisposable(this.viewModel.playersStore.subscribe(this.bump));
		void this.provisionPaired();
	}

	onDestroy(): void {
		this.destroyed = true;
	}

	onRender(): void {
		const sections = this.viewModel.playersStore.sections();
		const all = sections.flatMap((section) => section.players);
		const thisDevice = all.find((player) => player.isThisDevice);
		const showGroupHeaders = sections.length > 1;

		<layout style={styles.root}>
			<scroll
				onContentSizeChange={this.handleContentSizeChange}
				onScroll={this.handleScroll}
				ref={this.scrollRef}
				style={styles.scroll}
			>
				<view
					accessibilityId='players-view'
					accessibilityLabel='players-view'
					style={styles.content}
				>
					{thisDevice && (
						<layout style={styles.cardSlot}>
							<PlayerCard
								onToggle={createReusableCallback((enabled: boolean) => {
									this.viewModel.playersStore.setEnabled(thisDevice.id, enabled);
								})}
								player={thisDevice}
							/>
						</layout>
					)}
					{sections.map((section) => {
						const players = reorderable(section.players);
						if (players.length === 0) {
							return null;
						}

						return (
							<layout key={section.group} style={styles.section}>
								{showGroupHeaders && (
									<HomeSectionHeader
										accessibilityId={`players-group-${section.group}`}
										title={section.group.toUpperCase()}
									/>
								)}
								<ReorderableList
									dragScroller={this.dragAutoScroller}
									ids={players.map((player) => player.id)}
									onReorder={createReusableCallback((fromIndex: number, toIndex: number) => {
										this.handleReorder(section.group, fromIndex, toIndex);
									})}
									renderRow={createReusableCallback(
										(index: number, handle: ReorderableRowHandle) => {
											const player = players[index];
											if (!player) {
												return;
											}
											<layout style={styles.cardSlot}>
												<PlayerCard
													dragHandle={players.length > 1 ? handle : undefined}
													onLongPress={createReusableCallback(() => {
														this.handleForgetTap(player);
													})}
													onToggle={createReusableCallback((enabled: boolean) => {
														this.viewModel.playersStore.setEnabled(player.id, enabled);
													})}
													player={player}
												/>
											</layout>;
										},
									)}
									rowIdentityPrefix={`player-${section.group}-`}
								/>
							</layout>
						);
					})}
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

	private announce = (failure: string | null): void => {
		if (failure === null || this.destroyed) {
			return;
		}

		this.viewModel.toastService.show({ message: failure, variant: ToastTypes.error });
	};

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private handleAddCancel = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleContentSizeChange = (size: ContentSizeChangeEvent): void => {
		this.dragAutoScroller.setContentHeight(size.height);
	};

	private handleForgetCancel = (): void => {
		this.forgetTarget = null;
		closeSlot(this.viewModel.modalSlot);
	};

	private handleForgetConfirm = (): void => {
		const target = this.forgetTarget;
		this.forgetTarget = null;
		closeSlot(this.viewModel.modalSlot);
		if (target) {
			this.viewModel.playersStore.forget(target.id);
		}
	};

	private handleForgetTap = (player: Player): void => {
		this.forgetTarget = player;
		openSlot(this.viewModel.modalSlot, () => {
			<Modal
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
				body={Strings.playersForgetBody(player.name)}
				cancelAccessibilityId='players-forget-cancel'
				confirmAccessibilityId='players-forget-confirm'
				confirmLabel={Strings.playersForgetConfirm()}
				modalAccessibilityId='players-forget-modal'
				onClose={this.handleForgetCancel}
				onConfirm={this.handleForgetConfirm}
				title={Strings.playersForgetTitle()}
			/>;
		});
	};

	// the store orders players across every group, so a drop inside one section is translated
	// through the ids either side of it rather than by adding a section offset — groups need
	// not occupy a contiguous run of that order
	private handleReorder = (group: string, fromIndex: number, toIndex: number): void => {
		const store = this.viewModel.playersStore;
		const sections = store.sections();
		// the indices come from the rendered list, which leaves this device out
		const players = reorderable(sections.find((section) => section.group === group)?.players ?? []);
		const moved = players[fromIndex];
		const target = players[toIndex];
		if (!moved || !target) {
			return;
		}

		const ordered = sections.flatMap((section) => section.players);
		store.reorder(
			ordered.findIndex((player) => player.id === moved.id),
			ordered.findIndex((player) => player.id === target.id),
		);
	};

	private handlePair = (player: ProbedPlayer, code: string): Promise<Player> =>
		this.viewModel.playersStore.pair(player, code).then((paired) => {
			void this.provision(paired).then(this.announce);

			return paired;
		});

	private handleProbe = (address: string): Promise<ProbedPlayer> =>
		this.viewModel.playersStore.probe(address);

	private handleScroll = (event: ScrollEvent): void => {
		this.dragAutoScroller.setOffset(event.y);
	};

	private async provision(player: Player): Promise<string | null> {
		try {
			await this.viewModel.playersStore.provision(player.id);

			return null;
		} catch (error) {
			return provisionMessage(error, player.name);
		}
	}

	private async provisionPaired(): Promise<void> {
		await this.viewModel.playersStore.ensureLoaded();

		const paired = this.viewModel.playersStore
			.sections()
			.flatMap((section) => section.players)
			.filter((player) => !player.isThisDevice);

		let failure: string | null = null;
		for (const player of paired) {
			if (this.destroyed) {
				return;
			}

			const message = await this.provision(player);
			failure ??= message;
		}

		this.announce(failure);
	}

	private handleAddTap = (): void => {
		openSlot(this.viewModel.modalSlot, () => {
			<AddPlayerModal
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
				onCancel={this.handleAddCancel}
				onPair={this.handlePair}
				onProbe={this.handleProbe}
			/>;
		});
	};
}

function provisionMessage(error: unknown, name: string): string | null {
	if (!isErrorConst(error)) {
		return null;
	}

	switch (error.err) {
		case 'auth_quick_connect_not_available':
			return Strings.playersProvisionQuickConnectOff();
		case 'invalid_token':
			return Strings.playersProvisionNeedsPairing(name);
		case 'media_server_id_mismatch':
			return Strings.playersProvisionOtherServer(name);
		case 'media_server_user_mismatch':
			return Strings.playersProvisionRefused(name);
		default:
			return null;
	}
}

function reorderable(players: Array<Player>): Array<Player> {
	return players.filter((player) => !player.isThisDevice);
}

const styles = {
	cardSlot: new Style<Layout>({
		paddingBottom: theme.scale(12),
		width: '100%',
	}),
	content: new Style<View>({
		marginTop: theme.scale(12),
		paddingLeft: theme.scale(14),
		paddingRight: theme.scale(14),
		width: '100%',
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
