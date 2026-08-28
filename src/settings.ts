import { App, Platform, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type RemoteSyncPlugin from "./main";
import { R2Client } from "./r2/r2-client";
import { persistAndRestartR2Client } from "./r2/r2-settings-lifecycle";
import { formatSafeR2Error, sanitizeR2Error } from "./r2/safe-error";

export interface RemoteSyncSettings {
	// R2
	r2Enabled: boolean;
	r2AccountId: string;
	r2AccessKeyIdSecretName: string;
	r2SecretAccessKeySecretName: string;
	// Legacy plaintext fields are accepted only long enough to migrate them.
	r2AccessKeyId?: string;
	r2SecretAccessKey?: string;
	r2BucketName: string;
	r2Jurisdiction: "" | "eu" | "fedramp";
	syncIntervalSeconds: number;
	excludedFolders: string;
	excludedExtensions: string;
	// Git
	gitEnabled: boolean;
	gitPath: string;
	gitAuthorName: string;
	gitAuthorEmail: string;
	gitRemoteUrl: string;
	gitBranch: string;
}

export const DEFAULT_SETTINGS: RemoteSyncSettings = {
	r2Enabled: false,
	r2AccountId: "",
	r2AccessKeyIdSecretName: "",
	r2SecretAccessKeySecretName: "",
	r2BucketName: "",
	r2Jurisdiction: "",
	syncIntervalSeconds: 30,
	excludedFolders: ".obsidian",
	excludedExtensions: "",
	gitEnabled: false,
	gitPath: "",
	gitAuthorName: "",
	gitAuthorEmail: "",
	gitRemoteUrl: "",
	gitBranch: "main",
};

export class RemoteSyncSettingTab extends PluginSettingTab {
	plugin: RemoteSyncPlugin;

	constructor(app: App, plugin: RemoteSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("remote-sync-settings");

		// --- R2 Connection ---
		containerEl.createEl("h2", { text: "Cloudflare R2 Connection" });

		new Setting(containerEl)
			.setName("Enable R2 Sync")
			.setDesc("Sync your vault to Cloudflare R2 storage.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.r2Enabled)
					.onChange(async (value) => {
						this.plugin.settings.r2Enabled = value;
						await persistAndRestartR2Client(this.plugin);
					})
			);

		new Setting(containerEl)
			.setName("Account ID")
			.setDesc("Your Cloudflare account ID.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. abc123def456")
					.setValue(this.plugin.settings.r2AccountId)
					.onChange(async (value) => {
						this.plugin.settings.r2AccountId = value.trim();
						await persistAndRestartR2Client(this.plugin);
					})
			);

		new Setting(containerEl)
			.setName("Access Key ID")
			.setDesc("Select or create an Obsidian secret containing the R2 access key ID.")
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.r2AccessKeyIdSecretName)
					.onChange(async (value) => {
						this.plugin.settings.r2AccessKeyIdSecretName = value;
						await persistAndRestartR2Client(this.plugin);
					})
			);

		new Setting(containerEl)
			.setName("Secret Access Key")
			.setDesc("Select or create an Obsidian secret containing the R2 secret access key.")
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.r2SecretAccessKeySecretName)
					.onChange(async (value) => {
						this.plugin.settings.r2SecretAccessKeySecretName = value;
						await persistAndRestartR2Client(this.plugin);
					})
			);

		new Setting(containerEl)
			.setName("Bucket Name")
			.setDesc("The R2 bucket to sync with.")
			.addText((text) =>
				text
					.setPlaceholder("my-vault-bucket")
					.setValue(this.plugin.settings.r2BucketName)
					.onChange(async (value) => {
						this.plugin.settings.r2BucketName = value.trim();
						await persistAndRestartR2Client(this.plugin);
					})
			);

		new Setting(containerEl)
			.setName("Jurisdiction")
			.setDesc("R2 data residency jurisdiction.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("", "Global (default)")
					.addOption("eu", "EU")
					.addOption("fedramp", "FedRAMP")
					.setValue(this.plugin.settings.r2Jurisdiction)
					.onChange(async (value) => {
						this.plugin.settings.r2Jurisdiction = value as "" | "eu" | "fedramp";
						await persistAndRestartR2Client(this.plugin);
						this.display();
					})
			);

		// Endpoint display
		if (this.plugin.settings.r2AccountId) {
			const jur = this.plugin.settings.r2Jurisdiction;
			const jurPart = jur ? `.${jur}` : "";
			const endpoint = `https://${this.plugin.settings.r2AccountId}${jurPart}.r2.cloudflarestorage.com`;
			new Setting(containerEl)
				.setName("Endpoint")
				.setDesc(endpoint);
		}

		// Test Connection button
		const testConnectionSetting = new Setting(containerEl)
			.setName("Test Connection")
			.setDesc("Verify your R2 credentials work.")
			.addButton((button) => {
				button
					.setButtonText("Test Connection")
					.setCta()
					.onClick(async () => {
						button.setButtonText("Testing...");
						button.setDisabled(true);

						const resultEl = testConnectionSetting.descEl.createDiv(
							"connection-result"
						);

						try {
							const credentials = this.plugin.getR2Credentials();
							if (!credentials) {
								resultEl.addClass("error");
								resultEl.setText("Select two distinct R2 secrets first.");
								return;
							}
							const client = new R2Client(this.plugin.settings, credentials);
							const ok = await client.testConnection();
							if (ok) {
								resultEl.addClass("success");
								resultEl.setText(
									"Connection successful!"
								);
							} else {
								resultEl.addClass("error");
								resultEl.setText(
									"Connection failed. Check credentials."
								);
							}
						} catch (e) {
							const safeError = sanitizeR2Error(e);
							resultEl.addClass("error");
							resultEl.setText(`Connection error — ${formatSafeR2Error(safeError)}`);
						} finally {
							button.setButtonText("Test Connection");
							button.setDisabled(false);
						}
					});
			});

		// --- R2 Sync Options ---
		containerEl.createEl("h2", { text: "R2 Sync Options" });

		new Setting(containerEl)
			.setName("Sync Interval")
			.setDesc("How often to check for changes (seconds).")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.syncIntervalSeconds))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 5) {
							this.plugin.settings.syncIntervalSeconds = num;
							await persistAndRestartR2Client(this.plugin);
						}
					})
			);

		new Setting(containerEl)
			.setName("Excluded Folders")
			.setDesc("Comma-separated folder paths to exclude from sync.")
			.addText((text) =>
				text
					.setPlaceholder(".obsidian, .trash")
					.setValue(this.plugin.settings.excludedFolders)
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded Extensions")
			.setDesc("Comma-separated file extensions to exclude (e.g. .tmp, .log).")
			.addText((text) =>
				text
					.setPlaceholder(".tmp, .log")
					.setValue(this.plugin.settings.excludedExtensions)
					.onChange(async (value) => {
						this.plugin.settings.excludedExtensions = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Git (desktop only) ---
		if (Platform.isDesktop) {
			containerEl.createEl("h2", { text: "Git Integration (Desktop Only)" });

			new Setting(containerEl)
				.setName("Enable Git Sync")
				.setDesc("Enable on-demand Git snapshots of your vault.")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.gitEnabled)
						.onChange(async (value) => {
							this.plugin.settings.gitEnabled = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Git Executable Path")
				.setDesc("Path to git binary. Leave empty to auto-detect.")
				.addText((text) =>
					text
						.setPlaceholder("/usr/bin/git")
						.setValue(this.plugin.settings.gitPath)
						.onChange(async (value) => {
							this.plugin.settings.gitPath = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Author Name")
				.setDesc("Git commit author name.")
				.addText((text) =>
					text
						.setPlaceholder("Your Name")
						.setValue(this.plugin.settings.gitAuthorName)
						.onChange(async (value) => {
							this.plugin.settings.gitAuthorName = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Author Email")
				.setDesc("Git commit author email.")
				.addText((text) =>
					text
						.setPlaceholder("you@example.com")
						.setValue(this.plugin.settings.gitAuthorEmail)
						.onChange(async (value) => {
							this.plugin.settings.gitAuthorEmail = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Remote URL")
				.setDesc("Git remote URL for push.")
				.addText((text) =>
					text
						.setPlaceholder("https://github.com/user/repo.git")
						.setValue(this.plugin.settings.gitRemoteUrl)
						.onChange(async (value) => {
							this.plugin.settings.gitRemoteUrl = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Branch")
				.setDesc("Git branch to commit and push to.")
				.addText((text) =>
					text
						.setPlaceholder("main")
						.setValue(this.plugin.settings.gitBranch)
						.onChange(async (value) => {
							this.plugin.settings.gitBranch = value.trim();
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
