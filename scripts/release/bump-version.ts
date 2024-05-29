/**
 * File inspired by:
 * 	- https://github.com/Enveloppe/obsidian-enveloppe/blob/master/commit-and-tag-version.js
 * 	- https://github.com/mProjectsCode/obsidian-meta-bind-plugin/blob/master/automation/release.ts
 */
import * as Bun from "bun";
import { Command, Option } from "commander";
import { format } from "../utils/formatting";

const program = new Command()
	.addOption(
		new Option("-t, --type <type>", "Version bump type").choices(["patch", "minor", "major"]).default("patch"),
	)
	.addOption(new Option("-T, --testRun", "Run without commiting changes").default(false))
	.addOption(new Option("-r, --rc", "Create a release candidate version").default(false))
	.parse();

const versionType = program.opts().type as "patch" | "minor" | "major";
const testRun = program.opts().testRun;

const currentVersion = process.env.npm_package_version!;
const latestTag = Bun.spawnSync(["git", "describe", "--tags", "--abbrev=0"]).stdout.toString().trim();
const wasRC = latestTag.includes("rc");
const isRC = program.opts().rc;

const package_json_file = Bun.file("package.json");
const manifest_file = Bun.file("manifest.json");
const manifest_beta_file = Bun.file("manifest-beta.json");

const package_json = await package_json_file.json();
const manifest = await manifest_file.json();
const manifest_beta = await manifest_beta_file.json();

const [major, minor, patch] = currentVersion.split(".").map(Number);
let newVersion = "";
if (wasRC && isRC) {
	const rcNumber = Number(latestTag.split("-rc.")[1]);
	newVersion = `${major}.${minor}.${patch}-rc.${rcNumber + 1}`;
} else {
	switch (versionType) {
		case "patch":
			newVersion = `${major}.${minor}.${patch + 1}`;
			break;
		case "minor":
			newVersion = `${major}.${minor + 1}.0`;
			break;
		case "major":
			newVersion = `${major + 1}.0.0`;
			break;
		default:
			throw new Error("Invalid version type");
	}
	newVersion = isRC ? `${newVersion}-rc.0` : newVersion;
}

if (testRun) {
	console.log(
		`${format(" Test run ", "bg_blue")} | Bumped plugin version ${
			format(`${currentVersion} -> ${newVersion}`, "fg_blue")
		} | ${format(`[${versionType}]${(isRC ? " [release candidate]" : "")}`, "fg_yellow")}`,
	);
	process.exit(0);
}

package_json.version = newVersion;
if (!isRC)
	manifest.version = newVersion;
manifest_beta.version = newVersion;

await Bun.write("package.json", JSON.stringify(package_json, null, 4).replace(/\n/g, "\r\n"));
await Bun.write(manifest_file, JSON.stringify(manifest, null, 4).replace(/\n/g, "\r\n"));
await Bun.write("manifest-beta.json", JSON.stringify(manifest_beta, null, 4).replace(/\n/g, "\r\n"));

try {
	Bun.spawnSync(["git", "add", "package.json", "manifest.json", "manifest-beta.json"]);
	Bun.spawnSync(["git", "commit", "-m", `chore(release): ${newVersion}`]);
	Bun.spawnSync(["git", "tag", "-a", newVersion, "-m", `chore(release): ${newVersion}`]);
	console.log(
		`${format(" Success ", "bg_green")} | Bumped plugin version ${
			format(`${currentVersion} -> ${newVersion}`, "fg_blue")
		} | ${format(`[${versionType}]${(isRC ? " [release candidate]" : "")}`, "fg_yellow")}`,
	);
} catch (error) {
	console.log(`${format(" Error ", "bg_red")} | ${format("Failed when running git commands", "fg_red")}`);
}
