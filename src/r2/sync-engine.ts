import { Notice, Vault, TFile, TAbstractFile } from "obsidian";
import type RemoteSyncPlugin from "../main";
import type { RemoteSyncSettings } from "../settings";
import { R2Client, type R2Object } from "./r2-client";
import { showConflictModal, type ConflictResolution } from "./conflict-modal";

export interface FileSyncRecord {
	localHash: string;
	remoteETag: string;
	lastSynced: number;
}

export interface SyncState {
	files: Record<string, FileSyncRecord>;
}

export type SyncStatus = "idle" | "syncing" | "error" | "paused";

export class SyncEngine {
	private plugin: RemoteSyncPlugin;
	private vault: Vault;
	private client: R2Client | null = null;
	private changeQueue: Set<string> = new Set();
	private deletedPaths: Set<string> = new Set();
	private timer: ReturnType<typeof setInterval> | null = null;
	private syncState: SyncState = { files: {} };
	private _status: SyncStatus = "idle";
	private syncing = false;
	private eventRefs: ReturnType<Vault["on"]>[] = [];
	private onSyncComplete: (() => void) | null = null;

	get status(): SyncStatus {
		return this._status;
	}

	constructor(plugin: RemoteSyncPlugin) {
		this.plugin = plugin;
		this.vault = plugin.app.vault;
	}

	setOnSyncComplete(cb: () => void): void {
		this.onSyncComplete = cb;
	}

	async start(): Promise<void> {
		if (!this.plugin.settings.r2Enabled) return;
		if (!this.hasValidConfig()) {
			console.warn("Remote Sync: R2 credentials not configured.");
			return;
		}

		this.client = new R2Client(this.plugin.settings);
		await this.loadSyncState();
		this.registerVaultEvents();
		this.startTimer();
		this._status = "idle";
		this.plugin.updateStatusBar();

		// Initial sync: queue all local files so existing vault content gets synced
		const files = this.vault.getFiles();
		for (const file of files) {
			if (!this.isExcluded(file.path)) {
				this.changeQueue.add(file.path);
			}
		}
		await this.runSyncCycle();
	}

	stop(): void {
		this.stopTimer();
		this.unregisterVaultEvents();
		this.client = null;
		this._status = "idle";
		this.plugin.updateStatusBar();
	}

	pause(): void {
		this.stopTimer();
		this._status = "paused";
		this.plugin.updateStatusBar();
	}

	resume(): void {
		if (this._status === "paused") {
			this.startTimer();
			this._status = "idle";
			this.plugin.updateStatusBar();
		}
	}

	async forceSync(): Promise<void> {
		// Mark all local files as changed to trigger a full sync
		const files = this.vault.getFiles();
		for (const file of files) {
			if (!this.isExcluded(file.path)) {
				this.changeQueue.add(file.path);
			}
		}
		await this.runSyncCycle();
	}

	private hasValidConfig(): boolean {
		const s = this.plugin.settings;
		return !!(s.r2AccountId && s.r2AccessKeyId && s.r2SecretAccessKey && s.r2BucketName);
	}

	private registerVaultEvents(): void {
		this.eventRefs.push(
			this.vault.on("create", (file) => this.onFileChange(file)),
			this.vault.on("modify", (file) => this.onFileChange(file)),
			this.vault.on("delete", (file) => this.onFileDelete(file)),
			this.vault.on("rename", (file, oldPath) => this.onFileRename(file, oldPath))
		);
	}

	private unregisterVaultEvents(): void {
		for (const ref of this.eventRefs) {
			this.vault.offref(ref);
		}
		this.eventRefs = [];
	}

	private onFileChange(file: TAbstractFile): void {
		if (file instanceof TFile && !this.isExcluded(file.path)) {
			this.changeQueue.add(file.path);
		}
	}

	private onFileDelete(file: TAbstractFile): void {
		if (file instanceof TFile && !this.isExcluded(file.path)) {
			this.deletedPaths.add(file.path);
			this.changeQueue.delete(file.path);
		}
	}

	private onFileRename(file: TAbstractFile, oldPath: string): void {
		if (file instanceof TFile) {
			if (!this.isExcluded(oldPath)) {
				this.deletedPaths.add(oldPath);
				this.changeQueue.delete(oldPath);
			}
			if (!this.isExcluded(file.path)) {
				this.changeQueue.add(file.path);
			}
		}
	}

	private startTimer(): void {
		this.stopTimer();
		const ms = this.plugin.settings.syncIntervalSeconds * 1000;
		this.timer = setInterval(() => {
			if (this.changeQueue.size > 0 || this.deletedPaths.size > 0) {
				this.runSyncCycle();
			}
		}, ms);
	}

	private stopTimer(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private isExcluded(filePath: string): boolean {
		const settings = this.plugin.settings;

		const excludedFolders = settings.excludedFolders
			.split(",")
			.map((f) => f.trim())
			.filter(Boolean);

		for (const folder of excludedFolders) {
			if (filePath.startsWith(folder + "/") || filePath === folder) {
				return true;
			}
		}

		const excludedExts = settings.excludedExtensions
			.split(",")
			.map((e) => e.trim())
			.filter(Boolean);

		for (const ext of excludedExts) {
			const normalizedExt = ext.startsWith(".") ? ext : "." + ext;
			if (filePath.endsWith(normalizedExt)) {
				return true;
			}
		}

		return false;
	}

	private async runSyncCycle(): Promise<void> {
		if (this.syncing || !this.client) return;
		if (this._status === "paused") return;

		this.syncing = true;
		this._status = "syncing";
		this.plugin.updateStatusBar();

		try {
			// Snapshot the queues and clear them
			const changedPaths = new Set(this.changeQueue);
			const deleted = new Set(this.deletedPaths);
			this.changeQueue.clear();
			this.deletedPaths.clear();

			// Get local and remote state
			const localFiles = this.getLocalFiles();
			const remoteObjects = await this.client.listObjects();
			const remoteMap = new Map<string, R2Object>();
			for (const obj of remoteObjects) {
				remoteMap.set(obj.key, obj);
			}

			const allPaths = new Set<string>();
			for (const path of localFiles.keys()) allPaths.add(path);
			for (const key of remoteMap.keys()) allPaths.add(key);
			for (const path of deleted) allPaths.add(path);

			const isInitialSync = Object.keys(this.syncState.files).length === 0;

			for (const path of allPaths) {
				if (this.isExcluded(path)) continue;

				const localFile = localFiles.get(path);
				const remoteObj = remoteMap.get(path);
				const syncRecord = this.syncState.files[path];
				const wasDeleted = deleted.has(path);
				const wasChanged = changedPaths.has(path);

				await this.reconcileFile(
					path,
					localFile ?? null,
					remoteObj ?? null,
					syncRecord ?? null,
					wasDeleted,
					wasChanged,
					isInitialSync
				);
			}

			await this.saveSyncState();

			// Fire callback if there were actual changes
			if (changedPaths.size > 0 || deleted.size > 0) {
				this.onSyncComplete?.();
			}

			this._status = "idle";
		} catch (e) {
			console.error("Remote Sync: sync cycle failed", e);
			this._status = "error";
			new Notice(`Remote Sync: sync error — ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.syncing = false;
			this.plugin.updateStatusBar();
		}
	}

	private async reconcileFile(
		path: string,
		localFile: TFile | null,
		remoteObj: R2Object | null,
		syncRecord: FileSyncRecord | null,
		wasDeleted: boolean,
		wasChanged: boolean,
		isInitialSync: boolean
	): Promise<void> {
		if (!this.client) return;

		const localExists = localFile !== null && !wasDeleted;
		const remoteExists = remoteObj !== null;

		// Case: file exists nowhere (deleted on both sides or stale state)
		if (!localExists && !remoteExists) {
			delete this.syncState.files[path];
			return;
		}

		// No previous sync record (new to sync system)
		if (!syncRecord) {
			if (localExists && !remoteExists) {
				// New local file → upload
				await this.uploadFile(path, localFile!);
				return;
			}
			if (!localExists && remoteExists) {
				// New remote file → download
				await this.downloadFile(path, remoteObj!);
				return;
			}
			if (localExists && remoteExists) {
				// Both exist, no sync record
				const localHash = await this.hashFile(localFile!);
				if (localHash === remoteObj!.etag) {
					// Same content — record state
					this.syncState.files[path] = {
						localHash,
						remoteETag: remoteObj!.etag,
						lastSynced: Date.now(),
					};
				} else if (isInitialSync) {
					// Different content on initial sync → conflict
					const resolution = await this.resolveConflict(path, localFile!, remoteObj!);
					await this.applyResolution(path, localFile!, remoteObj!, resolution);
				} else {
					// New on both sides outside initial sync — upload local (local wins)
					await this.uploadFile(path, localFile!);
				}
				return;
			}
		}

		// Has sync record — determine what changed
		const localHash = localExists ? await this.hashFile(localFile!) : null;
		const localChanged = localExists
			? localHash !== syncRecord!.localHash
			: false;
		const remoteChanged = remoteExists
			? remoteObj!.etag !== syncRecord!.remoteETag
			: false;

		if (wasDeleted && !remoteChanged) {
			// Local deleted, remote unchanged → delete remote
			await this.client.deleteObject(path);
			delete this.syncState.files[path];
			return;
		}

		if (wasDeleted && remoteChanged) {
			// Local deleted but remote changed → conflict
			// Re-download remote version (remote wins for deleted+changed)
			await this.downloadFile(path, remoteObj!);
			return;
		}

		if (!localExists && !remoteExists) {
			delete this.syncState.files[path];
			return;
		}

		if (localExists && !remoteExists) {
			if (localChanged || wasChanged) {
				// Local changed, remote deleted → upload (local wins)
				await this.uploadFile(path, localFile!);
			} else {
				// Local unchanged, remote deleted → delete local
				await this.vault.delete(localFile!);
				delete this.syncState.files[path];
			}
			return;
		}

		if (!localExists && remoteExists) {
			// Shouldn't reach here if wasDeleted was handled above
			await this.downloadFile(path, remoteObj!);
			return;
		}

		// Both exist with sync record
		if (localChanged && !remoteChanged) {
			await this.uploadFile(path, localFile!);
		} else if (!localChanged && remoteChanged) {
			await this.downloadFile(path, remoteObj!);
		} else if (localChanged && remoteChanged) {
			const resolution = await this.resolveConflict(path, localFile!, remoteObj!);
			await this.applyResolution(path, localFile!, remoteObj!, resolution);
		}
		// else: neither changed — no action needed
	}

	private async uploadFile(path: string, file: TFile): Promise<void> {
		if (!this.client) return;
		const content = await this.vault.readBinary(file);
		const localHash = computeMd5Hex(content);
		const etag = await this.client.uploadObject(path, content);
		this.syncState.files[path] = {
			localHash,
			remoteETag: etag || localHash,
			lastSynced: Date.now(),
		};
	}

	private async downloadFile(path: string, remoteObj: R2Object): Promise<void> {
		if (!this.client) return;
		const content = await this.client.downloadObject(path);

		// Ensure parent folders exist
		const parts = path.split("/");
		if (parts.length > 1) {
			const folderPath = parts.slice(0, -1).join("/");
			if (!this.vault.getAbstractFileByPath(folderPath)) {
				await this.vault.createFolder(folderPath);
			}
		}

		const existingFile = this.vault.getAbstractFileByPath(path);
		if (existingFile instanceof TFile) {
			await this.vault.modifyBinary(existingFile, content);
		} else {
			await this.vault.createBinary(path, content);
		}

		const localHash = computeMd5Hex(content);
		this.syncState.files[path] = {
			localHash,
			remoteETag: remoteObj.etag,
			lastSynced: Date.now(),
		};
	}

	private async resolveConflict(
		path: string,
		localFile: TFile,
		remoteObj: R2Object
	): Promise<ConflictResolution> {
		return showConflictModal(this.plugin.app, {
			filePath: path,
			localSize: localFile.stat.size,
			localModified: localFile.stat.mtime,
			remoteSize: remoteObj.size,
			remoteModified: remoteObj.lastModified,
		});
	}

	private async applyResolution(
		path: string,
		localFile: TFile,
		remoteObj: R2Object,
		resolution: ConflictResolution
	): Promise<void> {
		if (!this.client) return;

		switch (resolution) {
			case "keep-local":
				await this.uploadFile(path, localFile);
				break;
			case "keep-remote":
				await this.downloadFile(path, remoteObj);
				break;
			case "keep-both": {
				// Upload local to overwrite remote, download remote as conflict copy
				const remoteContent = await this.client.downloadObject(path);
				const ext = path.lastIndexOf(".") >= 0 ? path.slice(path.lastIndexOf(".")) : "";
				const base = ext ? path.slice(0, -ext.length) : path;
				const timestamp = formatTimestamp(new Date());
				const conflictPath = `${base}.sync-conflict-${timestamp}${ext}`;

				// Save remote version as conflict file
				await this.vault.createBinary(conflictPath, remoteContent);

				// Upload local version
				await this.uploadFile(path, localFile);

				// Upload conflict copy to remote too
				const conflictFile = this.vault.getAbstractFileByPath(conflictPath);
				if (conflictFile instanceof TFile) {
					await this.uploadFile(conflictPath, conflictFile);
				}
				break;
			}
		}
	}

	private async hashFile(file: TFile): Promise<string> {
		const content = await this.vault.readBinary(file);
		return computeMd5Hex(content);
	}

	private getLocalFiles(): Map<string, TFile> {
		const map = new Map<string, TFile>();
		for (const file of this.vault.getFiles()) {
			if (!this.isExcluded(file.path)) {
				map.set(file.path, file);
			}
		}
		return map;
	}

	private async loadSyncState(): Promise<void> {
		const data = await this.plugin.loadData();
		if (data?.syncState) {
			this.syncState = data.syncState;
		} else {
			this.syncState = { files: {} };
		}
	}

	private async saveSyncState(): Promise<void> {
		const data = (await this.plugin.loadData()) ?? {};
		data.syncState = this.syncState;
		await this.plugin.saveData(data);
	}
}

function computeMd5Hex(buffer: ArrayBuffer): string {
	// Simple hash for comparing file content
	// Using a FNV-1a-like hash since we don't have crypto in all environments
	// R2 ETags are MD5, but for local comparison a consistent hash works
	const bytes = new Uint8Array(buffer);
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < bytes.length; i++) {
		h1 ^= bytes[i];
		h1 = Math.imul(h1, 0x01000193);
		h2 ^= bytes[i];
		h2 = Math.imul(h2, 0x811c9dc5);
	}
	return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

function formatTimestamp(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
		`${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
	);
}
