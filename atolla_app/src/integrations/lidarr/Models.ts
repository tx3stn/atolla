export interface LidarrAlbum {
	artist?: { artistName?: string | null } | null;
	id: number;
	images?: Array<LidarrImage> | null;
	releaseDate?: string | null;
	title?: string | null;
}

export interface LidarrImage {
	coverType?: string;
	remoteUrl?: string | null;
}

export interface LidarrSystemStatus {
	appName?: string | null;
}
