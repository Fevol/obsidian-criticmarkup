import { CriticMarkupRange, getRangesInText } from "./editor/base";
import { type PluginSettings } from "./types";

export async function indexWorker(files: string[], settings: PluginSettings): Promise<CriticMarkupRange[][]> {
	return await Promise.all(files.map(async (file: string) => {
		return getRangesInText(file, settings);
	}));
}
