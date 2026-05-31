/** biome-ignore-all assist/source/useSortedInterfaceMembers: **/
export interface Scenario {
	label: string;
	arrange: () => Promise<void>;
	act: () => Promise<void>;
}
