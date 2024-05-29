module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    env: {
        node: true,
        browser: true
    },
    plugins: [
        "@typescript-eslint"
    ],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        // NOTE: `project: "./tsconfig.json"` does not work well together with svelte override plugin (TS parser singleton and yadayada)
        //      If svelte file checking is desired, comment project variables in parserOptions (and deprecation plugin)
        "plugin:deprecation/recommended",
        "plugin:svelte/recommended"
    ],
    parserOptions: {
        sourceType: "module",
        project: "./tsconfig.json",
        extraFileExtensions: [".svelte"],
    },
    rules: {
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": [
            "error",
            {"args": "none"}
        ],
        "@typescript-eslint/no-explicit-any": [
            "error",
            {"ignoreRestArgs": true}
        ],
        "@typescript-eslint/ban-ts-comment": "off",
        "no-prototype-builtins": "off",
        "@typescript-eslint/no-empty-function": "off",
        // Ignore A11y rules
        "svelte/valid-compile": "off",
    },
    overrides: [
        {
            files: ["*.svelte"],
            parser: "svelte-eslint-parser",
            parserOptions: {
                project: "./tsconfig.json",
                parser: "@typescript-eslint/parser",
            }
        }
    ],
    ignorePatterns: [
        "**/*.js",
        "**/*.svelte",
        "parser/"
    ]
}
