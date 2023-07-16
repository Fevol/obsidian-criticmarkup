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
	// 	"obsidian": "__mocks__/obsidian.ts",
	// },
};
