import type {CriticMarkupRange, CriticMarkupRangeEntry} from "../ranges";

export function groupRangeEntryByPath(ranges: CriticMarkupRangeEntry[]) {
    const grouped_ranges: Record<string, CriticMarkupRange[]> = {};
    for (const { path, range } of ranges) {
        if (!grouped_ranges[path]) grouped_ranges[path] = [];
        grouped_ranges[path].push(range);
    }
    return grouped_ranges;
}
