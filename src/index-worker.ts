import {CriticMarkupRange, getRangesInText} from "./editor/base";

export async function indexWorker(files: string[]): Promise<CriticMarkupRange[][]> {
    return await Promise.all(files.map(async (file: string) => {
        return getRangesInText(file).ranges;
    }));
}
