import test from "node:test";
import assert from "node:assert/strict";

import {
	markPathChanged,
	markPathDeleted,
	restoreFailedSnapshot,
	addMissingTrackedPathsAsDeleted,
} from "../src/r2/change-queue.ts";

test("recreating a deleted path cancels the queued deletion", () => {
	const changed = new Set<string>();
	const deleted = new Set<string>();

	markPathDeleted(changed, deleted, "attachments/example.bin");
	markPathChanged(changed, deleted, "attachments/example.bin");

	assert.deepEqual([...changed], ["attachments/example.bin"]);
	assert.deepEqual([...deleted], []);
});

test("restoring a failed snapshot preserves newer path events", () => {
	const changed = new Set(["newer-change.md"]);
	const deleted = new Set(["changed-then-deleted.md"]);
	const failedChanged = new Set(["retry-change.md", "changed-then-deleted.md"]);
	const failedDeleted = new Set(["retry-delete.md", "newer-change.md"]);

	restoreFailedSnapshot(changed, deleted, failedChanged, failedDeleted);

	assert.deepEqual([...changed].sort(), ["newer-change.md", "retry-change.md"]);
	assert.deepEqual([...deleted].sort(), ["changed-then-deleted.md", "retry-delete.md"]);
});

test("restart recovery marks missing tracked files as deleted but respects exclusions", () => {
	const deleted = new Set<string>();
	addMissingTrackedPathsAsDeleted(
		deleted,
		["kept.md", "offline-delete.md", "04_Private/private.md"],
		new Set(["kept.md"]),
		(path) => path.startsWith("04_Private/")
	);

	assert.deepEqual([...deleted], ["offline-delete.md"]);
});
