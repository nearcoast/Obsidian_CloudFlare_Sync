import { Plugin, Platform } from "obsidian";
import {
	type RemoteSyncSettings,
	DEFAULT_SETTINGS,
	RemoteSyncSettingTab,
} from "./settings";
import { SyncEngine, type SyncStatus } from "./r2/sync-engine";
import { GitSync } from "./git/git-sync";

export default class RemoteSyncPlugin extends Plugin {
	settings: RemoteSyncSettings = DEFAULT_SETTINGS;
	private syncEngine: SyncEngine | null = null;
	private gitSync: GitSync | null = null;
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Settings tab
		this.addSettingTab(new RemoteSyncSettingTab(this.app, this));

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar();

		// R2 Sync Engine
		this.syncEngine = new SyncEngine(this);
		this.app.workspace.onLayoutReady(async () => {
			await this.syncEngine?.start();

			// Git (desktop only)
			if (Platform.isDesktop && this.settings.gitEnabled) {
				await this.initGitSync();

				// Wire R2 sync completion → automatic Git backup (fire-and-forget)
				if (this.gitSync?.isReady) {
					this.syncEngine?.setOnSyncComplete(() => {
						if (!Platform.isDesktop || !this.settings.gitEnabled) return;
						if (!this.gitSync?.isReady) return;
						this.gitSync.syncToGit().catch((e) => {
							console.warn("Remote Sync: Git backup failed", e);
						});
					});
				}
			}
		});

		// R2 ribbon icon
		this.addRibbonIcon("refresh-cw", "Force R2 Sync", async () => {
			if (!this.settings.r2Enabled) {
				return;
			}
			await this.syncEngine?.forceSync();
		});

		// R2 commands
		this.addCommand({
			id: "force-r2-sync",
			name: "Force R2 Sync",
			callback: async () => {
				if (!this.settings.r2Enabled) return;
				await this.syncEngine?.forceSync();
			},
		});

		this.addCommand({
			id: "pause-resume-sync",
			name: "Pause/Resume R2 Sync",
			callback: () => {
				if (!this.syncEngine) return;
				if (this.syncEngine.status === "paused") {
					this.syncEngine.resume();
				} else {
					this.syncEngine.pause();
				}
			},
		});

		// Git ribbon + command (desktop only)
		if (Platform.isDesktop) {
			this.addRibbonIcon("git-branch", "Sync to Git", async () => {
				if (!this.settings.gitEnabled) return;
				if (!this.gitSync) await this.initGitSync();
				await this.gitSync?.syncToGit();
			});

			this.addCommand({
				id: "sync-to-git",
				name: "Sync to Git",
				callback: async () => {
					if (!this.settings.gitEnabled) return;
					if (!this.gitSync) await this.initGitSync();
					await this.gitSync?.syncToGit();
				},
			});
		}
	}

	async onunload(): Promise<void> {
		this.syncEngine?.stop();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
	}

	async saveSettings(): Promise<void> {
		const data = (await this.loadData()) ?? {};
		data.settings = this.settings;
		await this.saveData(data);
	}

	async restartSyncEngine(): Promise<void> {
		this.syncEngine?.stop();
		if (this.settings.r2Enabled) {
			await this.syncEngine?.start();
		}
	}

	updateStatusBar(): void {
		if (!this.statusBarEl) return;
		const status = this.syncEngine?.status ?? "idle";
		const labels: Record<SyncStatus, string> = {
			idle: "R2: Idle",
			syncing: "R2: Syncing...",
			error: "R2: Error",
			paused: "R2: Paused",
		};
		this.statusBarEl.setText(labels[status]);
	}

	private async initGitSync(): Promise<void> {
		this.gitSync = new GitSync(this);
		try {
			await this.gitSync.init();
		} catch (e) {
			console.error("Remote Sync: Failed to initialize Git", e);
			this.gitSync = null;
		}
	}
}
