import esbuild, {analyzeMetafile} from "esbuild";

import esbuildSvelte from "esbuild-svelte";
import inlineWorkerPlugin from "esbuild-plugin-inline-worker";
import {sassPlugin} from "esbuild-sass-plugin";
import sveltePreprocess from "svelte-preprocess";

import {banner} from "./banner";

import process from "process";
import builtins from "builtin-modules";
import builtinModules from "builtin-modules";


const prod = process.argv[2] === "production";
const dev = process.argv[2] === "development";
const dev_watch = process.argv[2] === "development-watch";
const verbose = process.argv.some((arg) => arg === 'verbose');

const dir = prod ? "./" : process.env.OUTDIR || "./";

const context = await esbuild.context({
    banner: {
        js: await banner(prod ? "production" : "development"),
    },
    entryPoints: ['src/main.ts', 'src/styles.css'],
    bundle: true,
    external: [
        'obsidian',
        'electron',
        '@codemirror/autocomplete',
        '@codemirror/closebrackets',
        '@codemirror/collab',
        '@codemirror/commands',
        '@codemirror/comment',
        '@codemirror/fold',
        '@codemirror/gutter',
        '@codemirror/highlight',
        '@codemirror/history',
        '@codemirror/language',
        '@codemirror/lint',
        '@codemirror/matchbrackets',
        '@codemirror/panel',
        '@codemirror/rangeset',
        '@codemirror/rectangular-selection',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/stream-parser',
        '@codemirror/text',
        '@codemirror/tooltip',
        '@codemirror/view',
        ...builtins],
    format: 'cjs',
    target: 'esnext',
    logLevel: "info",
    sourcemap: (prod || dev) ? false : 'inline',
    treeShaking: true,
    minify: prod,
    outdir: dir,
    metafile: verbose,
    drop: prod ? ["console"] : [],

    plugins: [
        sassPlugin(),
        esbuildSvelte({
            compilerOptions: {css: "injected", hydratable: false},
            preprocess: sveltePreprocess(),
            filterWarnings: (warning) => {
                // Remove accessibility warnings (base Obsidian ignores these guidelines too)
                return warning.code !== "a11y-click-events-have-key-events" && warning.code !== "a11y-no-static-element-interactions" &&
                    warning.code !== "a11y-mouse-events-have-key-events" && warning.code !== "a11y-no-noninteractive-element-interactions" &&
                    warning.code !== "a11y-no-noninteractive-tabindex"
            },
        }),
        inlineWorkerPlugin({
            platform: "browser",
            external: ["obsidian", ...builtinModules],
            format: "cjs",
            treeShaking: true,
            minify: prod,
            bundle: true,
            sourcemap: "inline",
        }),
    ]
});

if (prod || dev) {
    const build = await context.rebuild();
    if (verbose && build.metafile)
        console.log(await analyzeMetafile(build.metafile));
    process.exit(0);
} else {
    await context.watch();
}
