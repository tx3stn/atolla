export interface User {
	// Whatever the provider authenticates as: a GUID on Jellyfin, the username on OpenSubsonic.
	id: string;
	name: string;
}
