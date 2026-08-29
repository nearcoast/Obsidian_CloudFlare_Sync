import test from "node:test";
import assert from "node:assert/strict";

import { createConflictDecision } from "../src/r2/conflict-decision.ts";

test("dismissing a conflict resolves cancel exactly once", async () => {
	const decision = createConflictDecision();
	decision.choose("cancel");
	decision.choose("keep-local");

	assert.equal(await decision.promise, "cancel");
});
