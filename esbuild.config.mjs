import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		// Node.js builtins — not auto-externalized with platform: "browser".
		// Needed because simple-git (bundled but only executed on desktop) references these.
		"child_process",
		"fs",
		"path",
		"os",
		"events",
		"crypto",
		"http",
		"https",
		"net",
		"stream",
		"string_decoder",
		"tls",
		"url",
		"util",
		"zlib",
		"node:buffer",
		"node:path",
		"node:events",
		"node:child_process",
		"node:fs",
		"node:os",
		"node:crypto",
		"node:http",
		"node:https",
		"node:net",
		"node:stream",
		"node:string_decoder",
		"node:tls",
		"node:url",
		"node:util",
		"node:zlib",
	],
	define: {
		global: "globalThis",
	},
	platform: "browser",
	format: "cjs",
	target: "es2020",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
