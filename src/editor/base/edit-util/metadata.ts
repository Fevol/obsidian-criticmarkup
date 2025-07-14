import { CriticMarkupRange, type METADATA_TYPE, type MetadataFields } from "../ranges";
import type { PluginSettings } from "../../../types";

export type MetadataCompatibility = {
	[key in METADATA_TYPE]?: MetadataMergeAction;
};

export enum MetadataMergeAction {
	// TODO: Check necessity of SKIP action (giving warning for insert in diff-author range could also be handled on SPLIT level)
	// Disable action
	// SKIP = "skip",

	// Split range into two ranges (allow overwriting, does not allow merging)
	SPLIT = "split",
	// Move outside of range (does not allow overwriting, does not allow merging)
	MOVE_OUTSIDE = "move_outside",

	// Choose value of old range
	OLD = "old",
	// Choose value of new range
	NEW = "new",
}

export function generate_metadata(settings: PluginSettings): MetadataFields | undefined {
	let metadata: MetadataFields | undefined = undefined;
	if (settings.add_metadata) {
		metadata = {};
		if (settings.add_author_metadata)
			metadata.author = settings.author || undefined;
		if (settings.add_timestamp_metadata)
			metadata.time = Math.floor(Date.now() / 1000);
		if (Object.keys(metadata).length === 0)
			metadata = undefined;
	}

	return metadata;
}

const METADATA_INCOMPATIBILITY: MetadataCompatibility = {
	"author": MetadataMergeAction.SPLIT,
};

export function range_metadata_compatible(
	range: CriticMarkupRange,
	metadata_fields?: MetadataFields,
	metadata_compatibility: MetadataCompatibility = METADATA_INCOMPATIBILITY,
) {
	// If no metadata was provided, allow merging of range
	if (!metadata_fields)
		return { compatible: true, merged_metadata: range.fields };

	// If metadata was provided but range has no metadata, do not allow merging
	if (!range.fields)
		return { compatible: false, merged_metadata: undefined };

	const merged_metadata = Object.assign({}, range.fields, metadata_fields);
	for (const type of [...new Set(Object.keys(metadata_fields).concat(Object.keys(range.fields)))]) {
		if (metadata_fields[type] !== range.fields[type]) {
			const action = metadata_compatibility[type as METADATA_TYPE];
			if (MetadataMergeAction.SPLIT === action || MetadataMergeAction.MOVE_OUTSIDE === action)
				return { compatible: false, merged_metadata: undefined };
			else if (MetadataMergeAction.OLD === action)
				merged_metadata[type as METADATA_TYPE] = range.fields[type];
		}
	}
	return { compatible: true, merged_metadata };
}
