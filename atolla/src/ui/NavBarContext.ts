import type { ConnectionMode } from '../transports/Model';
import type { FooterTab } from './components/FooterTab';
import type { HeaderTab } from './components/HeaderTabs';
import type { SortOrder } from './components/SortNavPanel';

export interface NavBarHeaderContext {
	activeTab: HeaderTab;
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	onAlphabetLetterTap?: (letter: string | null) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onSortChange?: (sort: SortOrder) => void;
	onTabTap: (tab: HeaderTab) => void;
}

export interface NavBarContext {
	activeFooterTab: FooterTab;
	downloadingCount: number;
	header?: NavBarHeaderContext;
	onFooterTabTap: (tab: FooterTab) => void;
}
