import { Notice } from "obsidian";
import type RemoteSyncPlugin from "../main";
import { GitClient } from "./git-client";

export class GitSync {
	private plugin: RemoteSyncPlugin;
	private client: GitClient | null = null;
	private _ready = false;

	get isReady(): boolean {
		return this._ready && this.client !== null;
	}

	constructor(plugin: RemoteSyncPlugin) {
		this.plugin = plugin;
	}

	async init(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		// getBasePath is available on desktop FileSystemAdapter
		const basePath = (adapter as { getBasePath?: () => string }).getBasePath?.();
		if (!basePath) {
			console.warn("Remote Sync: Could not determine vault base path for Git.");
			return;
		}

		this.client = new GitClient(this.plugin.settings, basePath);
		await this.client.init();

		const isRepo = await this.client.isGitRepo();
		if (!isRepo) {
			await this.client.initRepo();
			new Notice("Remote Sync: Initialized git repository in vault.");
		}

		this._ready = true;
	}

	async syncToGit(): Promise<void> {
		if (!this.client) {
			new Notice("Remote Sync: Git not initialized.");
			return;
		}

		try {
			const status = await this.client.getStatus();
			const totalChanges = status.staged + status.modified + status.untracked;

			if (totalChanges === 0) {
				new Notice("Remote Sync: No changes to commit.");
				return;
			}

			const now = new Date();
			const message = `Vault snapshot ${now.toISOString().slice(0, 16).replace("T", " ")}`;

			const commitHash = await this.client.commitAll(message);
			new Notice(`Remote Sync: Committed ${totalChanges} changes (${commitHash.slice(0, 7)}).`);

			if (this.plugin.settings.gitRemoteUrl) {
				try {
					await this.client.push();
					new Notice("Remote Sync: Pushed to remote.");
				} catch (e) {
					new Notice(
						`Remote Sync: Commit saved locally but push failed — ${e instanceof Error ? e.message : String(e)}`
					);
				}
			}
		} catch (e) {
			console.error("Remote Sync: Git sync failed", e);
			new Notice(
				`Remote Sync: Git sync failed — ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}
}
