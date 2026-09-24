import Strings from 'atolla_app/src/Strings';
import type { LanguageCode } from 'atolla_core/src/Language';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ContentSizeChangeEvent, ScrollEvent } from 'valdi_tsx/src/GestureEvents';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Player } from '../../models/Player';
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
	private readonly scrollRef = new ElementRef<ScrollView>();
	private readonly dragAutoScroller = new ScrollDragAutoScroller(this.scrollRef);

	onCreate(): void {
		this.registerDisposable(this.viewModel.playersStore.subscribe(this.bump));
		void this.viewModel.playersStore.ensureLoaded();
	}

	onRender(): void {
		const sections = this.viewModel.playersStore.sections();
		const deviceName = this.viewModel.preferences.jellyfinClientDeviceName;
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
							<ReorderableList
								dragScroller={this.dragAutoScroller}
								ids={section.players.map((player) => player.id)}
								onReorder={createReusableCallback((fromIndex: number, toIndex: number) => {
									this.handleReorder(section.group, fromIndex, toIndex);
								})}
								renderRow={createReusableCallback((index: number, handle: ReorderableRowHandle) => {
									const player = section.players[index];
									if (!player) {
										return;
									}
									<layout style={styles.cardSlot}>
										<PlayerCard
											dragHandle={section.players.length > 1 ? handle : undefined}
											onToggle={createReusableCallback((enabled: boolean) => {
												this.viewModel.playersStore.setEnabled(player.id, enabled);
											})}
											player={named(player, deviceName)}
										/>
									</layout>;
								})}
								rowIdentityPrefix={`player-${section.group}-`}
							/>
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

	private handleContentSizeChange = (size: ContentSizeChangeEvent): void => {
		this.dragAutoScroller.setContentHeight(size.height);
	};

	// the store orders players across every group, so a drop inside one section is translated
	// through the ids either side of it rather than by adding a section offset — groups need
	// not occupy a contiguous run of that order
	private handleReorder = (group: string, fromIndex: number, toIndex: number): void => {
		const store = this.viewModel.playersStore;
		const sections = store.sections();
		const players = sections.find((section) => section.group === group)?.players ?? [];
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

	private handleScroll = (event: ScrollEvent): void => {
		this.dragAutoScroller.setOffset(event.y);
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
		paddingBottom: theme.scale(12),
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
