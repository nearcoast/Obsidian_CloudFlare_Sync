import { App, Modal } from "obsidian";
import {
	createConflictDecision,
	type ConflictResolution,
} from "./conflict-decision";

export type { ConflictResolution } from "./conflict-decision";

export interface ConflictInfo {
	filePath: string;
	localSize?: number;
	localModified?: number;
	remoteSize?: number;
	remoteModified?: Date;
}

export class ConflictModal extends Modal {
	private choose: (value: ConflictResolution) => void;
	private info: ConflictInfo;

	constructor(
		app: App,
		info: ConflictInfo,
		choose: (value: ConflictResolution) => void
	) {
		super(app);
		this.info = info;
		this.choose = choose;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("remote-sync-conflict-modal");

		contentEl.createEl("h3", { text: "Sync Conflict" });

		const infoDiv = contentEl.createDiv("conflict-info");
		infoDiv.createDiv({
			cls: "conflict-file-path",
			text: this.info.filePath,
		});
		infoDiv.createEl("p", {
			text: "This file was modified both locally and remotely since the last sync.",
		});

		const details = infoDiv.createDiv("conflict-details");

		const localDiv = details.createDiv();
		localDiv.createEl("strong", { text: "Local" });
		if (this.info.localSize !== undefined) {
			localDiv.createEl("p", {
				text: `Size: ${formatBytes(this.info.localSize)}`,
			});
		}
		if (this.info.localModified !== undefined) {
			localDiv.createEl("p", {
				text: `Modified: ${new Date(this.info.localModified).toLocaleString()}`,
			});
		}

		const remoteDiv = details.createDiv();
		remoteDiv.createEl("strong", { text: "Remote" });
		if (this.info.remoteSize !== undefined) {
			remoteDiv.createEl("p", {
				text: `Size: ${formatBytes(this.info.remoteSize)}`,
			});
		}
		if (this.info.remoteModified) {
			remoteDiv.createEl("p", {
				text: `Modified: ${this.info.remoteModified.toLocaleString()}`,
			});
		}

		const actions = contentEl.createDiv("conflict-actions");

		const keepLocalBtn = actions.createEl("button", {
			text: "Keep Local",
		});
		keepLocalBtn.addEventListener("click", () => {
			this.choose("keep-local");
			this.close();
		});

		const keepRemoteBtn = actions.createEl("button", {
			text: "Keep Remote",
		});
		keepRemoteBtn.addEventListener("click", () => {
			this.choose("keep-remote");
			this.close();
		});

		const keepBothBtn = actions.createEl("button", {
			text: "Keep Both",
			cls: "mod-cta",
		});
		keepBothBtn.addEventListener("click", () => {
			this.choose("keep-both");
			this.close();
		});
	}

	onClose() {
		this.choose("cancel");
		this.contentEl.empty();
	}
}

export function showConflictModal(
	app: App,
	info: ConflictInfo
): Promise<ConflictResolution> {
	const decision = createConflictDecision();
	new ConflictModal(app, info, decision.choose).open();
	return decision.promise;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
