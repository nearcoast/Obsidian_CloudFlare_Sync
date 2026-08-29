export function isSafeVaultPath(path: string): boolean {
	if (!path || path.startsWith("/") || path.startsWith("\\") || path.includes("\\")) {
		return false;
	}
	if (/\p{Cc}/u.test(path)) return false;
	const segments = path.split("/");
	return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
