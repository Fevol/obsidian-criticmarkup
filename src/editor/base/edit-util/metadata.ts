import {MetadataFields} from "../ranges";
import {PluginSettings} from "../../../types";


export function generate_metadata(settings: PluginSettings): MetadataFields | undefined {
    let metadata: MetadataFields | undefined = {};
    if (settings.enable_author)
        metadata.author = settings.author || undefined;
    if (settings.enable_timestamp)
        metadata.time = Math.floor(Date.now() / 1000);
    if (Object.keys(metadata).length === 0)
        metadata = undefined;

    return metadata;
}
