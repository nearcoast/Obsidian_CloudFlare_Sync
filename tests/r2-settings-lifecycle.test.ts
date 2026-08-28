import test from "node:test";
import assert from "node:assert/strict";

import { persistAndRestartR2Client } from "../src/r2/r2-settings-lifecycle.ts";

test("serializes overlapping R2 save and restart cycles", async () => {
	const events: string[] = [];
	let releaseFirstSave!: () => void;
	const firstSaveGate = new Promise<void>((resolve) => {
		releaseFirstSave = resolve;
	});
	let saveCount = 0;
	let restartCount = 0;
	const host = {
		async saveSettings(): Promise<void> {
			const call = ++saveCount;
			events.push(`save-${call}-start`);
			if (call === 1) await firstSaveGate;
			events.push(`save-${call}-end`);
		},
		async restartSyncEngine(): Promise<void> {
			events.push(`restart-${++restartCount}`);
		},
	};

	const first = persistAndRestartR2Client(host);
	const second = persistAndRestartR2Client(host);
	await new Promise<void>((resolve) => setImmediate(resolve));

	assert.deepEqual(events, ["save-1-start"]);
	releaseFirstSave();
	await Promise.all([first, second]);
	assert.deepEqual(events, [
		"save-1-start",
		"save-1-end",
		"restart-1",
		"save-2-start",
		"save-2-end",
		"restart-2",
	]);
});
