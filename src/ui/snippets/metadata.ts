import { CriticMarkupRange } from "../../editor/base";
import { setIcon } from "obsidian";

function addMetadataSeparator(metadata_container: HTMLElement): void {
    if (metadata_container.children.length > 0) {
        const separator = createSpan({
            cls: "cmtr-metadata-info-separator",
            text: " • ",
        });
        metadata_container.appendChild(separator);
    }

}

export function createMetadataInfoElement(range: CriticMarkupRange, cls?: string | string[], type: "none" | "label" | "icon" = "icon"): HTMLElement {
    const metadata_container = createDiv({ cls: ["cmtr-metadata-info"].concat(cls ?? []) });
    if (range.fields.author) {
        const authorField = createSpan({ cls: "cmtr-metadata-info-field" });
        if (type === "label") {
            const authorLabel = createSpan({
                cls: "cmtr-metadata-info-label",
                text: "Author: ",
            });
            authorField.appendChild(authorLabel);
        } else if (type === "icon") {
            const authorIcon = createSpan({cls: "cmtr-metadata-info-icon"});
            setIcon(authorIcon, "user");
            authorField.appendChild(authorIcon);
        }

        const author = createSpan({
            cls: "cmtr-metadata-info-author-data",
            text: range.fields.author,
        });
        authorField.appendChild(author);
        metadata_container.appendChild(authorField);
    }

    if (range.fields.time) {
        if (type !== "icon") {
            addMetadataSeparator(metadata_container);
        }
        const timeField = createSpan({ cls: "cmtr-metadata-info-field" });
        if (type === "label") {
            const timeLabel = createSpan({
                cls: "cmtr-metadata-info-label",
                text: "Updated at: ",
            });
            timeField.appendChild(timeLabel);
        } else if (type === "icon") {
            const timeIcon = createSpan({cls: "cmtr-metadata-info-icon"});
            setIcon(timeIcon, "clock");
            timeField.appendChild(timeIcon);
        }

        const time = createSpan({
            cls: "cmtr-metadata-info-time-data",
            text: window.moment.unix(range.fields.time!).format("MMM DD YYYY, HH:mm"),
        });
        timeField.appendChild(time);
        metadata_container.appendChild(timeField);
    }

    return metadata_container;
}
