import test from "node:test";
import assert from "node:assert/strict";

import { isPreconditionFailure } from "../src/r2/precondition-failure.ts";

test("classifies 412 precondition failures from SDK-like errors", () => {
	assert.equal(isPreconditionFailure({ name: "PreconditionFailed" }), true);
	assert.equal(
		isPreconditionFailure({ name: "S3ServiceException", $metadata: { httpStatusCode: 412 } }),
		true
	);
	assert.equal(isPreconditionFailure({ name: "Error" }), false);
	assert.equal(isPreconditionFailure(null), false);
});
