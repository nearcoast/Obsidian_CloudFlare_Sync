import test from "node:test";
import assert from "node:assert/strict";

import { formatSafeR2Error, sanitizeR2Error } from "../src/r2/safe-error.ts";

test("removes credential-bearing fields and messages from R2 errors", () => {
	const error = Object.assign(new Error("Rejected secret-value-123"), {
		name: "InvalidAccessKeyId",
		AWSAccessKeyId: "old-access-key-id",
		Authorization: "signed-authorization-value",
		$metadata: {
			httpStatusCode: 403,
			requestId: "safe-request-123",
		},
	});

	const safe = sanitizeR2Error(error);
	const serialized = JSON.stringify(safe);

	assert.deepEqual(safe, {
		name: "InvalidAccessKeyId",
		statusCode: 403,
		requestId: "safe-request-123",
	});
	assert.equal(serialized.includes("secret-value-123"), false);
	assert.equal(serialized.includes("old-access-key-id"), false);
	assert.equal(serialized.includes("authorization-value"), false);
});

test("formats only sanitized R2 error fields for user notices", () => {
	const hostile = Object.assign(new Error("secret-value-123"), {
		name: "InvalidAccessKeyId",
		AWSAccessKeyId: "old-access-key-id",
		$metadata: { httpStatusCode: 403, requestId: "req-safe" },
	});

	const formatted = formatSafeR2Error(sanitizeR2Error(hostile));

	assert.equal(formatted, "InvalidAccessKeyId (HTTP 403)");
	assert.equal(formatted.includes("secret-value-123"), false);
	assert.equal(formatted.includes("old-access-key-id"), false);
});
