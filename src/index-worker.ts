import { CriticMarkupRange, getRangesInText } from "./editor/base";
import { COMMENTATOR_GLOBAL } from "./global";
import { type PluginSettings } from "./types";

export async function indexWorker(files: string[], settings: PluginSettings): Promise<CriticMarkupRange[][]> {
	COMMENTATOR_GLOBAL.PLUGIN_SETTINGS = settings;
	return await Promise.all(files.map(async (file: string) => {
		return getRangesInText(file);
	}));
}
