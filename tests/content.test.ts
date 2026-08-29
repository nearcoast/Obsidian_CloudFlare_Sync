import test from "node:test";
import assert from "node:assert/strict";

import { arrayBuffersEqual } from "../src/r2/content.ts";

test("identical binary attachment content compares equal", () => {
	const local = new Uint8Array([0, 255, 1, 2, 3]).buffer;
	const remote = new Uint8Array([0, 255, 1, 2, 3]).buffer;

	assert.equal(arrayBuffersEqual(local, remote), true);
});

test("different binary attachment content compares unequal", () => {
	const local = new Uint8Array([0, 255, 1, 2, 3]).buffer;
	const remote = new Uint8Array([0, 255, 1, 2, 4]).buffer;

	assert.equal(arrayBuffersEqual(local, remote), false);
});
