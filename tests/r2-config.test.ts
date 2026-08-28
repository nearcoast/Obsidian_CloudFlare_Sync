import test from "node:test";
import assert from "node:assert/strict";

import { buildR2Endpoint } from "../src/r2/r2-config.ts";

const ACCOUNT_ID = "4d6d597ce0b1890731c3179edfb0d6dc";

test("builds the expected HTTPS endpoint for a valid account", () => {
	assert.equal(
		buildR2Endpoint(ACCOUNT_ID, ""),
		`https://${ACCOUNT_ID}.r2.cloudflarestorage.com`
	);
});

test("rejects an account ID that can redirect signed requests", () => {
	assert.throws(
		() => buildR2Endpoint("user@evil.example/path", ""),
		/invalid R2 account ID/i
	);
});

test("rejects a jurisdiction outside the Cloudflare allowlist", () => {
	assert.throws(
		() => buildR2Endpoint(ACCOUNT_ID, "eu@evil.example/path"),
		/invalid R2 jurisdiction/i
	);
});
