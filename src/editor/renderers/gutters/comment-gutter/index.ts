import { CommentMarker, commentGutterMarkers } from './marker';
import { comment_gutter } from './comment_gutter';

export { CommentMarker, commentGutterMarkers }

// Keep the gutter here, as Obsidian *really* does not like the circular reference
// between Markers and Gutters (which is required for calling the moveGutter function)
export const commentGutter = [
	commentGutterMarkers,
	comment_gutter({
		class: 'criticmarkup-comment-gutter' + (app.vault.getConfig('cssTheme') === "Minimal" ? ' is-minimal' : ''),
		markers: v => v.state.field(commentGutterMarkers),
	}),
];
