const R2_ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;
const R2_JURISDICTIONS = new Set(["", "eu", "fedramp"]);

export function buildR2Endpoint(accountId: string, jurisdiction: string): string {
	if (!R2_ACCOUNT_ID_PATTERN.test(accountId)) {
		throw new Error("Invalid R2 account ID");
	}
	if (!R2_JURISDICTIONS.has(jurisdiction)) {
		throw new Error("Invalid R2 jurisdiction");
	}

	const jurisdictionPart = jurisdiction ? `.${jurisdiction}` : "";
	const expectedHostname = `${accountId}${jurisdictionPart}.r2.cloudflarestorage.com`;
	const endpoint = new URL(`https://${expectedHostname}`);
	if (
		endpoint.protocol !== "https:" ||
		endpoint.hostname !== expectedHostname ||
		endpoint.username !== "" ||
		endpoint.password !== "" ||
		endpoint.port !== ""
	) {
		throw new Error("Invalid R2 endpoint");
	}
	return endpoint.origin;
}
