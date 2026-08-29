export const REMOTE_SYNC_INTERNAL_PREFIX = ".remote-sync/";

export function createProbeKey(uniqueId: string): string {
	if (!/^[a-f0-9-]+$/i.test(uniqueId)) throw new Error("Invalid probe identifier");
	return `${REMOTE_SYNC_INTERNAL_PREFIX}probes/${uniqueId}`;
}

export function buildExclusiveProbePutInput(bucket: string, key: string) {
	return {
		Bucket: bucket,
		Key: key,
		Body: new Uint8Array([116, 101, 115, 116]),
		IfNoneMatch: "*" as const,
	};
}

export interface ConnectionProbeOperations {
	createExclusive(key: string): Promise<void>;
	read(key: string): Promise<void>;
	remove(key: string): Promise<void>;
}

export async function runConnectionProbe(
	key: string,
	operations: ConnectionProbeOperations
): Promise<void> {
	let created = false;
	try {
		await operations.createExclusive(key);
		created = true;
		await operations.read(key);
	} finally {
		if (created) await operations.remove(key);
	}
}
