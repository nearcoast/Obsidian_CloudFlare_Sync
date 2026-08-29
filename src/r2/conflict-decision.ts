export type ConflictResolution = "keep-local" | "keep-remote" | "keep-both" | "cancel";

export interface ConflictDecision {
	promise: Promise<ConflictResolution>;
	choose(resolution: ConflictResolution): void;
}

export function createConflictDecision(): ConflictDecision {
	let settled = false;
	let resolvePromise!: (resolution: ConflictResolution) => void;
	const promise = new Promise<ConflictResolution>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		choose(resolution) {
			if (settled) return;
			settled = true;
			resolvePromise(resolution);
		},
	};
}
