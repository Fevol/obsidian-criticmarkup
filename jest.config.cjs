module.exports = {
	testEnvironment: 'jsdom',
	testMatch: ["**/tests/**/*.test.ts"],

	collectCoverage: false,

	transform: {
		// isolatedModules: transpile-only. ts-jest emits CommonJS, which conflicts with the
		// project's verbatimModuleSyntax/ESNext tsconfig, so type-checking is delegated to
		// `bun run build` (tsc) and tests use a CommonJS-friendly tsconfig instead.
		'^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json', isolatedModules: true }],
		"^.+\\.(js|jsx)$": "esbuild-jest"
	},


	moduleDirectories: ["node_modules", "src", "tests"],
	moduleFileExtensions: ['js', 'ts'],
	// The `obsidian` package ships types only; __mocks__/obsidian.ts is auto-loaded by jest as
	// its runtime stub.

	// jest.setup.cjs stubs the Obsidian globals (`app`, `activeWindow`, ...) that some modules
	// reference at import time; jest-expect-message adds the message arg to expect().
	setupFiles: ["<rootDir>/jest.setup.cjs"],
	setupFilesAfterEnv: ["jest-expect-message"],
	noStackTrace: true,
};
