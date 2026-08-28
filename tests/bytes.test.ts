import test from "node:test";
import assert from "node:assert/strict";

import { copyUint8ArrayToArrayBuffer } from "../src/r2/bytes.ts";

test("copies a Uint8Array view into an exact ArrayBuffer", () => {
	const backing = new Uint8Array([9, 1, 2, 3, 9]);
	const view = backing.subarray(1, 4);

	const result = copyUint8ArrayToArrayBuffer(view);

	assert.ok(result instanceof ArrayBuffer);
	assert.deepEqual([...new Uint8Array(result)], [1, 2, 3]);
});
