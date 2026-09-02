import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MOBILE_FORBIDDEN_RUNTIME_MODULES = [
	"child_process",
	"node:child_process",
	"fs",
	"node:fs",
	"path",
	"node:path",
	"events",
	"node:events",
];

test("the mobile entry bundle does not load desktop-only Node modules", async () => {
	const bundle = await readFile(new URL("../main.js", import.meta.url), "utf8");
	const loadedForbiddenModules = MOBILE_FORBIDDEN_RUNTIME_MODULES.filter((moduleName) =>
		bundle.includes(`require(\"${moduleName}\")`)
	);

	assert.deepEqual(
		loadedForbiddenModules,
		[],
		`main.js loads desktop-only modules: ${loadedForbiddenModules.join(", ")}`
	);
});
