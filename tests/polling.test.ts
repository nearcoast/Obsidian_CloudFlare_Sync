import test from "node:test";
import assert from "node:assert/strict";

import { scheduleRemotePoll } from "../src/r2/polling.ts";

test("scheduled polling runs even when there are no local changes", () => {
	let callback: (() => void) | null = null;
	let polls = 0;
	const setIntervalFn = (cb: () => void, _ms: number) => {
		callback = cb;
		return 1;
	};

	scheduleRemotePoll(setIntervalFn, 30_000, () => {
		polls += 1;
	});
	callback!();

	assert.equal(polls, 1);
});
