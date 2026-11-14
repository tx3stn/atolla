import { setAtollaMediaUploadTarget, setAtollaMediaUploadWindow } from '../TrackPlaybackNative';
import type { MediaUploader } from './SpeakerOutput';

export class MediaUploaderNativeAdapter implements MediaUploader {
	setTarget(host: string, port: number, token: string): void {
		setAtollaMediaUploadTarget(host, port, token);
	}

	setWindow(trackIds: Array<string>, sendFiles: boolean): void {
		setAtollaMediaUploadWindow(JSON.stringify(trackIds), sendFiles);
	}
}
