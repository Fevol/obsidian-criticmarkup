import {CriticMarkupRange, getRangesInText} from "./editor/base";
import {PluginSettings} from "./types";
import {COMMENTATOR_GLOBAL} from "./global";

export async function indexWorker(files: string[], settings: PluginSettings): Promise<CriticMarkupRange[][]> {
    COMMENTATOR_GLOBAL.PLUGIN_SETTINGS = settings;
    return await Promise.all(files.map(async (file: string) => {
        return getRangesInText(file);
    }));
}
