export function markPathChanged(
	changed: Set<string>,
	deleted: Set<string>,
	path: string
): void {
	deleted.delete(path);
	changed.add(path);
}

export function markPathDeleted(
	changed: Set<string>,
	deleted: Set<string>,
	path: string
): void {
	changed.delete(path);
	deleted.add(path);
}

export function addMissingTrackedPathsAsDeleted(
	deleted: Set<string>,
	trackedPaths: Iterable<string>,
	localPaths: ReadonlySet<string>,
	isExcluded: (path: string) => boolean
): void {
	for (const path of trackedPaths) {
		if (!localPaths.has(path) && !isExcluded(path)) deleted.add(path);
	}
}

export function restoreFailedSnapshot(
	changed: Set<string>,
	deleted: Set<string>,
	failedChanged: ReadonlySet<string>,
	failedDeleted: ReadonlySet<string>
): void {
	for (const path of failedChanged) {
		if (!deleted.has(path)) changed.add(path);
	}
	for (const path of failedDeleted) {
		if (!changed.has(path)) deleted.add(path);
	}
}
