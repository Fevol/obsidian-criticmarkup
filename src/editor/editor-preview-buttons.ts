import {MarkdownView, setIcon} from "obsidian";
import type CommentatorPlugin from "../main";

export function loadEditorButtons(plugin: CommentatorPlugin) {
    const status_mapping = [
        { icon: "message-square", tooltip: "Show all suggestions", label: "Showing suggestions"  },
        { icon: "check", tooltip: "Preview \"accept all\"", label: "Previewing \"accept all\"" },
        { icon: "cross", tooltip: "Preview \"reject all\"" , label: "Previewing \"reject all\"" },
    ];

    for (const leaf of app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view as MarkdownView;
        if (plugin.button_mapping.has(view)) continue;

        const buttonElement = view.addAction("message-square", "View all suggestions", () => {
            plugin.settings.suggestion_status = (plugin.settings.suggestion_status + 1) % status_mapping.length;
            const { icon, tooltip, label } = status_mapping[plugin.settings.suggestion_status];
            setIcon(buttonElement, icon);
            buttonElement.setAttribute("aria-label", tooltip);
            statusElement.innerText = label;
            plugin.saveSettings();
        });

        const statusElement = buttonElement.createSpan({
            text: status_mapping[plugin.settings.suggestion_status].label,
            cls: "criticmarkup-suggestion-status"
        });

        // @ts-ignore (Parent element exists)
        buttonElement.parentElement.insertBefore(statusElement, buttonElement);

        plugin.button_mapping.set(view, {
            button: buttonElement,
            status: statusElement,
        });
    }
}

export async function removeEditorButtons(plugin: CommentatorPlugin) {
    for (const leaf of app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view as MarkdownView;
        if (!plugin.button_mapping.has(view)) continue;
        const elements = plugin.button_mapping.get(view);
        if (elements) {
            elements.button.detach();
            elements.status.detach();
        }
        plugin.button_mapping.delete(view);
    }
}