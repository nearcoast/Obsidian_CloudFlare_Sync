import test from "node:test";
import assert from "node:assert/strict";

import { decideReconciliation } from "../src/r2/reconcile-plan.ts";

const base = {
	hasRecord: false,
	localExists: true,
	remoteExists: true,
	wasDeleted: false,
	wasChanged: false,
	localChanged: false,
	remoteChanged: false,
	isInitialSync: true,
	contentsEqual: true,
};

test("initial identical local and remote content records state without conflict", () => {
	assert.equal(decideReconciliation(base), "record");
});

test("initial differing local and remote content requires conflict resolution", () => {
	assert.equal(decideReconciliation({ ...base, contentsEqual: false }), "conflict");
});

test("discovers files conservatively when no prior sync record exists", () => {
	assert.equal(decideReconciliation({ ...base, remoteExists: false }), "upload");
	assert.equal(
		decideReconciliation({ ...base, localExists: false, contentsEqual: undefined }),
		"download"
	);
	assert.equal(
		decideReconciliation({
			...base,
			localExists: false,
			remoteExists: false,
			contentsEqual: undefined,
		}),
		"clear-state"
	);
	assert.equal(
		decideReconciliation({ ...base, isInitialSync: false, contentsEqual: false }),
		"conflict"
	);
});

test("propagates unopposed deletes while preserving a changed surviving side", () => {
	const tracked = { ...base, hasRecord: true, isInitialSync: false, contentsEqual: undefined };
	assert.equal(
		decideReconciliation({ ...tracked, localExists: false, wasDeleted: true }),
		"delete-remote"
	);
	assert.equal(
		decideReconciliation({
			...tracked,
			localExists: false,
			wasDeleted: true,
			remoteChanged: true,
		}),
		"download"
	);
	assert.equal(
		decideReconciliation({ ...tracked, remoteExists: false }),
		"trash-local"
	);
	assert.equal(
		decideReconciliation({ ...tracked, remoteExists: false, localChanged: true }),
		"upload"
	);
	assert.equal(
		decideReconciliation({ ...tracked, remoteExists: false, wasChanged: true }),
		"trash-local"
	);
});

test("reconciles tracked changes without silently overwriting concurrent edits", () => {
	const tracked = { ...base, hasRecord: true, isInitialSync: false, contentsEqual: undefined };
	assert.equal(decideReconciliation({ ...tracked, localChanged: true }), "upload");
	assert.equal(decideReconciliation({ ...tracked, remoteChanged: true }), "download");
	assert.equal(
		decideReconciliation({ ...tracked, localChanged: true, remoteChanged: true }),
		"conflict"
	);
	assert.equal(decideReconciliation(tracked), "none");
});

test("records converged identical bytes instead of raising a false conflict", () => {
	const tracked = {
		...base,
		hasRecord: true,
		isInitialSync: false,
		localChanged: true,
		remoteChanged: true,
		contentsEqual: true,
	};
	assert.equal(decideReconciliation(tracked), "record");
});
