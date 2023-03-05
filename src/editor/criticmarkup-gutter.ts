import { GutterMarker } from '@codemirror/view';

export class CriticMarkupMarker extends GutterMarker {
	constructor(readonly from: number, readonly to: number, readonly type: string, readonly top?: boolean, readonly bottom?: boolean) {
		super();
	}

	toDOM() {
		return createDiv({
			cls: `criticmarkup-gutter-${this.type}`
				+ (this.top ? ' criticmarkup-gutter-top' : '')
				+ (this.bottom ? ' criticmarkup-gutter-bottom' : ''),
		});
	}
}