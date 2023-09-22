import { commentGutterMarkers } from './marker';
import { right_gutter } from './right_gutter';


export const commentGutter = [
	commentGutterMarkers,
	right_gutter({
		class: 'criticmarkup-comment-gutter' + (app.vault.getConfig('cssTheme') === "Minimal" ? ' is-minimal' : ''),
		markers: v => v.state.field(commentGutterMarkers),
	}),
];
