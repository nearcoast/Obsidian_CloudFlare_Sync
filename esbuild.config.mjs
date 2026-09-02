import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const sharedExternal = [
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
];

const mobileContext = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: sharedExternal,
	plugins: [{
		name: "desktop-git-boundary",
		setup(build) {
			build.onResolve({ filter: /^\.\/git\/git-sync$/ }, (args) => {
				if (args.kind !== "dynamic-import") return;
				return { path: "./desktop-git.js", external: true };
			});
		},
	}],
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

const desktopGitContext = await esbuild.context({
	entryPoints: ["src/git/git-sync.ts"],
	bundle: true,
	external: sharedExternal,
	platform: "node",
	format: "cjs",
	target: "node18",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "desktop-git.js",
	minify: prod,
});

if (prod) {
	await Promise.all([mobileContext.rebuild(), desktopGitContext.rebuild()]);
	await Promise.all([mobileContext.dispose(), desktopGitContext.dispose()]);
	process.exit(0);
} else {
	await Promise.all([mobileContext.watch(), desktopGitContext.watch()]);
}
