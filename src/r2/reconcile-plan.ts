export type ReconcileAction =
	| "record"
	| "clear-state"
	| "upload"
	| "download"
	| "delete-remote"
	| "trash-local"
	| "conflict"
	| "none";

export interface ReconcileFacts {
	hasRecord: boolean;
	localExists: boolean;
	remoteExists: boolean;
	wasDeleted: boolean;
	wasChanged: boolean;
	localChanged: boolean;
	remoteChanged: boolean;
	isInitialSync: boolean;
	contentsEqual?: boolean;
}

export function decideReconciliation(facts: ReconcileFacts): ReconcileAction {
	if (!facts.localExists && !facts.remoteExists) return "clear-state";

	if (!facts.hasRecord) {
		if (facts.localExists && !facts.remoteExists) return "upload";
		if (!facts.localExists && facts.remoteExists) return "download";
		if (facts.localExists && facts.remoteExists) {
			if (facts.contentsEqual === true) return "record";
			return "conflict";
		}
	}

	if (facts.wasDeleted) return facts.remoteChanged ? "download" : "delete-remote";
	if (facts.localExists && !facts.remoteExists) {
		return facts.localChanged ? "upload" : "trash-local";
	}
	if (!facts.localExists && facts.remoteExists) return "download";
	if (facts.localExists && facts.remoteExists) {
		if (facts.localChanged && facts.remoteChanged) {
			return facts.contentsEqual === true ? "record" : "conflict";
		}
		if (facts.localChanged) return "upload";
		if (facts.remoteChanged) return "download";
		return "none";
	}

	throw new Error("Unhandled reconciliation state");
}
