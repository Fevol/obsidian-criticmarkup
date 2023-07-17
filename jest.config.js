module.exports = {
	testEnvironment: 'jsdom',
	testMatch: ["**/tests/**/*.test.ts"],

	collectCoverage: false,

	transform: {
		'^.+\\.ts$': 'ts-jest',
		"^.+\\.(js|jsx)$": "esbuild-jest"
	},


	moduleDirectories: ["node_modules", "src", "tests"],
	moduleFileExtensions: ['js', 'ts'],
	// moduleNameMapper: {
	// 	"obsidian": "tests/__mocks__/obsidian_mock.ts",
	// },

	setupFilesAfterEnv: ["jest-expect-message"],
	noStackTrace: true,
};
