import {MetadataFields} from "../ranges";
import {COMMENTATOR_GLOBAL} from "../../../global";


export function generate_metadata(): MetadataFields | undefined {
    let metadata: MetadataFields | undefined = undefined;
    if (COMMENTATOR_GLOBAL.PLUGIN_SETTINGS.add_metadata) {
        metadata = {};
        if (COMMENTATOR_GLOBAL.PLUGIN_SETTINGS.add_author_metadata)
            metadata.author = COMMENTATOR_GLOBAL.PLUGIN_SETTINGS.author || undefined;
        if (COMMENTATOR_GLOBAL.PLUGIN_SETTINGS.add_timestamp_metadata)
            metadata.time = Math.floor(Date.now() / 1000);
        if (Object.keys(metadata).length === 0)
            metadata = undefined;
    }

    return metadata;
}
