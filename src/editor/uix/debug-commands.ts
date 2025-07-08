import {showProgressBarNotice} from "../../util/obsidian-util";
import type CommentatorPlugin from "../../main";

export const debug_application_commands = (plugin: CommentatorPlugin) => [
    {
        id: "toggle-vim",
        name: "(DEBUG) Toggle Vim mode",
        icon: "comment",
        regular_callback: async () => {
            plugin.app.vault.setConfig("vimMode", !plugin.app.vault.getConfig("vimMode"));
        },
    },
    {
        id: "progress-bar-notice",
        name: "(DEBUG) Test Progress Bar Notice",
        callback: async () => {
            const progressBarUpdate = showProgressBarNotice("Test progress bar", "Test progress bar finished", 10, 1000, "Test");
            for (let i = 0; i < 10; i++) {
                progressBarUpdate(i + 1);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
    },
];
