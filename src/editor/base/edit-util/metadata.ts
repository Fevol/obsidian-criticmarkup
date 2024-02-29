import {MetadataFields} from "../ranges";
import {PluginSettings} from "../../../types";


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
