import { RangeSet, RangeValue } from '@codemirror/state';
import { MarkdownView } from 'obsidian';
import { type EditorView } from '@codemirror/view';


export function objectDifference<T>(new_obj: T, old_obj: T): Partial<T> {
    const diff: Partial<typeof new_obj> = {};
    for (const key in new_obj)
        if (new_obj[key] !== old_obj[key])
            diff[key] = new_obj[key];
    return diff;
}

export function objectIntersection(o1: object, o2: object): string[] {
    return Object.keys(o1).filter({}.hasOwnProperty.bind(o2));
}

export function arrayIntersection<T, U extends T>(arr1: T[], arr2: U[]): (T | U)[] {
    return arr1.filter(x => arr2.includes(x as U));
}

// TODO: Specify overlap behavior of T and U (extends is not sufficient)
export function arrayDifference<T, U extends T>(arr1: T[], arr2: U[]): T[] {
    return arr1.filter(x => !arr2.includes(x as U));
}

export function arraySymmetricDifference<T, U extends T>(arr1: T[], ...arrs: U[][]): (T | U)[] {
    return arrs.reduce((acc, arr) => [
        ...arrayDifference(acc, arr),
        ...arrayDifference(arr, acc as U[]),
    ], arr1);
}

export function indexOfRegex(string: string, regex: RegExp, fromIndex?: number) {
    const str = fromIndex ? string.substring(fromIndex) : string;
    const match = str.match(regex);
    return match ? str.indexOf(match[0]) + (fromIndex ?? 0) : -1;
}

export function lastIndexOfRegex(string: string, regex: RegExp, fromIndex?: number) {
    const str = fromIndex ? string.substring(0, fromIndex) : string;
    const match = str.match(regex);
    return match ? str.lastIndexOf(match[match.length - 1]) : -1;
}

export function spliceString(str: string, remove: [number, number][]) {
    for (const [start, length] of remove.reverse())
        if (length < 0)
            str = str.slice(0, start - length) + str.slice(start - 2 * length);
        else
            str = str.slice(0, start) + str.slice(start + length);
    return str;
}

export function debugRangeset<Type extends RangeValue>(set: RangeSet<Type>): { from: number, to: number, value: Type }[] {
    const ptr = set.iter();
    const output: { from: number, to: number, value: Type }[] = [];
    while (ptr.value) {
        output.push({ from: ptr.from, to: ptr.to, value: ptr.value });
        ptr.next();
    }
    return output;
}

export function capitalizeFirstLetter(string: string) {
    return string.charAt(0).toUpperCase() + string.toLowerCase().slice(1);
}

export const hSpace = /\S\n\v\f\r\u2028\u2029/;

export function splitIntoEvenChunks<T>(array: T[], chunk_count: number): T[][] {
    const result: T[][] = [];
    for (let i = chunk_count; i > 0; i--)
        result.push(array.splice(0, Math.ceil(array.length / i)));
    return result;
}

export function iterateAllCMInstances(callback: (cm: EditorView) => void) {
    app.workspace.iterateAllLeaves((leaf) => {
        // @ts-ignore
        if (leaf.view instanceof MarkdownView && leaf.view.currentMode.type === "source")
            // @ts-ignore
            callback(leaf.view.editor.cm);
    });
}
