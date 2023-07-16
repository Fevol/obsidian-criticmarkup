import esbuild, { analyzeMetafile } from 'esbuild';
import process from "process";
import builtins from 'builtin-modules'
import {sassPlugin} from "esbuild-sass-plugin";

const banner =
    `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = (process.argv[2] === 'production');
const dev = (process.argv[2] === 'development');
const dev_watch = (process.argv[2] === 'development-watch');
const verbose = process.argv.some((arg) => arg === 'verbose');

const dir = prod ? "./" : process.env.OUTDIR || "./";

const context = await esbuild.context({
    banner: {
        js: banner,
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

    plugins: [
        sassPlugin(),
    ]
});

if (prod || dev) {
    let build = await context.rebuild();
    if (verbose)
        console.log(await analyzeMetafile(build.metafile));
    process.exit(0);
} else {
    await context.watch();
}
