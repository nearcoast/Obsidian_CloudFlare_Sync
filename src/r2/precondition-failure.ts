interface SdkLikeError {
	name?: string;
	$metadata?: { httpStatusCode?: number };
}

export function isPreconditionFailure(error: unknown): boolean {
	if (error === null || typeof error !== "object") return false;
	const candidate = error as SdkLikeError;
	if (candidate.name === "PreconditionFailed") return true;
	return candidate.$metadata?.httpStatusCode === 412;
}
