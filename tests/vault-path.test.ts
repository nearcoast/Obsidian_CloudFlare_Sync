import test from "node:test";
import assert from "node:assert/strict";

import { isSafeVaultPath } from "../src/r2/vault-path.ts";

test("rejects remote object keys that can escape or ambiguously address the vault", () => {
	const unsafe = [
		"../outside.md",
		"folder/../../outside.md",
		"/absolute.md",
		"folder\\windows.md",
		"folder//ambiguous.md",
		"folder/./ambiguous.md",
		"folder/\0hidden.md",
	];
	for (const path of unsafe) assert.equal(isSafeVaultPath(path), false, path);

	assert.equal(isSafeVaultPath("attachments/Малюнок 1.png"), true);
});
