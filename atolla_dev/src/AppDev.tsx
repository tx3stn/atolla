import { App } from 'atolla/src/App';
import { Component } from 'valdi_core/src/Component';
import { devTools } from './devTools';

// Root component for the local dev variant (//atolla_dev's valdi_application). It renders the shared
// App with dev tooling injected, which lights up the developer section in settings. The released
// //:atolla build uses App directly as its root and passes no dev tooling, so this module — and every
// dev surface it pulls in — stays out of the release dependency closure.
export class AppDev extends Component {
	onRender(): void {
		<App devTools={devTools} />;
	}
}
