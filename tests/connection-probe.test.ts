import test from "node:test";
import assert from "node:assert/strict";

import {
	buildExclusiveProbePutInput,
	createProbeKey,
	runConnectionProbe,
} from "../src/r2/connection-probe.ts";

test("a failed exclusive probe create never deletes a pre-existing object", async () => {
	let reads = 0;
	let deletes = 0;

	await assert.rejects(
		runConnectionProbe(".remote-sync/probes/collision", {
			createExclusive: async () => {
				throw new Error("already exists");
			},
			read: async () => {
				reads += 1;
			},
			remove: async () => {
				deletes += 1;
			},
		})
	);

	assert.equal(reads, 0);
	assert.equal(deletes, 0);
});

test("probe writes use a unique reserved key and exclusive create precondition", () => {
	const key = createProbeKey("123e4567-e89b-12d3-a456-426614174000");
	const input = buildExclusiveProbePutInput("vault-bucket", key);

	assert.equal(key, ".remote-sync/probes/123e4567-e89b-12d3-a456-426614174000");
	assert.equal(input.IfNoneMatch, "*");
	assert.equal(input.Bucket, "vault-bucket");
	assert.equal(input.Key, key);
});

test("a probe created by this invocation is cleaned up when its read fails", async () => {
	let deletes = 0;
	await assert.rejects(
		runConnectionProbe(".remote-sync/probes/owned", {
			createExclusive: async () => undefined,
			read: async () => {
				throw new Error("read failed");
			},
			remove: async () => {
				deletes += 1;
			},
		})
	);
	assert.equal(deletes, 1);
});
