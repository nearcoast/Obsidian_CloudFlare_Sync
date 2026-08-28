export interface SafeR2Error {
	name: string;
	statusCode?: number;
	requestId?: string;
}

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function sanitizeR2Error(error: unknown): SafeR2Error {
	const record = isRecord(error) ? error : {};
	const metadata = isRecord(record.$metadata) ? record.$metadata : {};
	const rawName = typeof record.name === "string" ? record.name : "";
	const result: SafeR2Error = {
		name: SAFE_ERROR_NAME.test(rawName) ? rawName : "R2Error",
	};

	const statusCode = metadata.httpStatusCode;
	if (typeof statusCode === "number" && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) {
		result.statusCode = statusCode;
	}

	const requestId = metadata.requestId;
	if (typeof requestId === "string" && SAFE_REQUEST_ID.test(requestId)) {
		result.requestId = requestId;
	}

	return result;
}

export function formatSafeR2Error(error: SafeR2Error): string {
	const status = error.statusCode === undefined ? "" : ` (HTTP ${error.statusCode})`;
	return `${error.name}${status}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
