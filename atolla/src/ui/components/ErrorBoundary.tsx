import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { getLogger } from '../../services/Logger';
import { theme } from '../../theme';
import { hapticFeedback } from '../../utils/Haptics';

const log = getLogger('ErrorBoundary');

export interface ErrorBoundaryViewModel {
	// changing this clears a caught error and retries rendering: pass an id for the current content
	// (e.g. active track id) so the next track recovers from a previous render crash
	resetKey?: string | number;
}

interface CaughtError {
	message: string;
	stack: string | null;
}

interface ErrorBoundaryState {
	error: CaughtError | null;
}

// Valdi unwinds a render exception to the nearest ancestor implementing onError; without a boundary
// a single throw below tears down the entire app in production builds, so render a fallback instead
export class ErrorBoundary extends StatefulComponent<ErrorBoundaryViewModel, ErrorBoundaryState> {
	state: ErrorBoundaryState = { error: null };

	onError(error: Error): void {
		const caught = describeCaughtError(error);
		log.error('caught render error', { message: caught.message });
		this.setState({ error: caught });
	}

	onRender(): void {
		const { error } = this.state;
		if (error) {
			<view accessibilityId='error-boundary-fallback' style={styles.container}>
				<label style={styles.title} value={Strings.errorBoundaryTitle()} />
				<view
					accessibilityId='error-boundary-details'
					onTap={this.copyDetails}
					style={styles.details}
				>
					<label style={styles.message} value={error.message} />
					{error.stack != null && (
						<scroll style={styles.stackScroll}>
							<label style={styles.stack} value={error.stack} />
						</scroll>
					)}
				</view>
			</view>;
			return;
		}

		<slot />;
	}

	onViewModelUpdate(prevViewModel?: ErrorBoundaryViewModel): void {
		if (this.state.error && this.viewModel.resetKey !== prevViewModel?.resetKey) {
			this.setState({ error: null });
		}
	}

	private copyDetails = (): void => {
		const { error } = this.state;
		if (!error) {
			return;
		}
		hapticFeedback();
		Device.copyToClipBoard(formatErrorForCopy(error));
	};
}

// the renderer hands onError a RendererError wrapper whose own message/stack are unreliable (this JS
// engine drops them when Error is subclassed); the real thrown cause is carried on `sourceError`
function describeCaughtError(error: Error): CaughtError {
	const cause = (error as { sourceError?: unknown }).sourceError ?? error;
	return { message: readMessage(cause), stack: readStack(cause) };
}

function formatErrorForCopy(error: CaughtError): string {
	return error.stack != null ? `${error.message}\n\n${error.stack}` : error.message;
}

function readMessage(cause: unknown): string {
	if (cause instanceof Error && cause.message) {
		return cause.message;
	}
	const text = String(cause);
	return text === '[object Object]' ? 'Unknown error' : text;
}

function readStack(cause: unknown): string | null {
	try {
		const stack = (cause as { stack?: unknown }).stack;
		return typeof stack === 'string' && stack.length > 0 ? stack : null;
	} catch {
		return null;
	}
}

const styles = {
	container: new Style<View>({
		alignItems: 'center',
		bottom: 0,
		flexDirection: 'column',
		justifyContent: 'center',
		left: 0,
		paddingLeft: 24,
		paddingRight: 24,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	details: new Style<View>({
		alignItems: 'center',
		flexDirection: 'column',
		maxHeight: '55%',
		paddingTop: 8,
		slowClipping: true,
		width: '100%',
	}),
	message: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	stack: new Style<Label>({
		...theme.text.sub,
	}),
	stackScroll: new Style<ScrollView>({
		flexGrow: 1,
		paddingTop: 12,
		width: '100%',
	}),
	title: new Style<Label>({
		...theme.text.title,
		color: theme.colors.destructive,
		textAlign: 'center',
	}),
};
