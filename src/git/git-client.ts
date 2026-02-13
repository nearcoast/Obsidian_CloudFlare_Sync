import type { SimpleGit } from "simple-git";
import type { RemoteSyncSettings } from "../settings";

export class GitClient {
	private git: SimpleGit | null = null;
	private settings: RemoteSyncSettings;
	private basePath: string;

	constructor(settings: RemoteSyncSettings, basePath: string) {
		this.settings = settings;
		this.basePath = basePath;
	}

	async init(): Promise<void> {
		// Dynamic import since simple-git is desktop-only
		const { simpleGit } = await import("simple-git");

		const options: Record<string, string> = {};
		if (this.settings.gitPath) {
			options.binary = this.settings.gitPath;
		}

		this.git = simpleGit(this.basePath, options);

		// Verify git binary is available
		await this.validateGit();

		// Configure author if set
		if (this.settings.gitAuthorName) {
			await this.git.addConfig("user.name", this.settings.gitAuthorName);
		}
		if (this.settings.gitAuthorEmail) {
			await this.git.addConfig("user.email", this.settings.gitAuthorEmail);
		}

		// Set up remote if needed
		if (this.settings.gitRemoteUrl) {
			try {
				const remotes = await this.git.getRemotes();
				if (!remotes.find((r) => r.name === "origin")) {
					await this.git.addRemote("origin", this.settings.gitRemoteUrl);
				}
			} catch {
				// Remote may already exist
			}
		}
	}

	private async validateGit(): Promise<void> {
		if (!this.git) throw new Error("Git not initialized");
		try {
			await this.git.version();
		} catch {
			throw new Error(
				`Git binary not found${this.settings.gitPath ? ` at "${this.settings.gitPath}"` : ""}. Install Git or set the correct path in settings.`
			);
		}
	}

	async isGitRepo(): Promise<boolean> {
		if (!this.git) return false;
		try {
			return await this.git.checkIsRepo();
		} catch {
			return false;
		}
	}

	async initRepo(): Promise<void> {
		if (!this.git) return;
		await this.git.init();
		if (this.settings.gitBranch && this.settings.gitBranch !== "main") {
			await this.git.checkout(["-b", this.settings.gitBranch]);
		}
	}

	async commitAll(message: string): Promise<string> {
		if (!this.git) throw new Error("Git not initialized");
		await this.git.add("-A");
		const result = await this.git.commit(message);
		return result.commit;
	}

	async push(): Promise<void> {
		if (!this.git) throw new Error("Git not initialized");
		const branch = this.settings.gitBranch || "main";
		await this.git.push("origin", branch, ["--set-upstream"]);
	}

	async getStatus(): Promise<{ staged: number; modified: number; untracked: number }> {
		if (!this.git) throw new Error("Git not initialized");
		const status = await this.git.status();
		return {
			staged: status.staged.length,
			modified: status.modified.length,
			untracked: status.not_added.length,
		};
	}
}
