export type RemoteWriteCondition =
	| { IfMatch: string; IfNoneMatch?: undefined }
	| { IfNoneMatch: "*"; IfMatch?: undefined };

export function remoteWriteCondition(listedEtag: string | null): RemoteWriteCondition {
	if (listedEtag === null) return { IfNoneMatch: "*" };
	return { IfMatch: listedEtag };
}
