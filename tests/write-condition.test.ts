import test from "node:test";
import assert from "node:assert/strict";

import { remoteWriteCondition } from "../src/r2/write-condition.ts";

test("remote writes use compare-and-swap conditions from the listed object state", () => {
	assert.deepEqual(remoteWriteCondition("etag-at-list"), { IfMatch: "etag-at-list" });
	assert.deepEqual(remoteWriteCondition(null), { IfNoneMatch: "*" });
});
