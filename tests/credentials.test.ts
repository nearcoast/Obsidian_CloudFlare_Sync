import test from "node:test";
import assert from "node:assert/strict";

import { resolveR2Credentials } from "../src/credentials.ts";

test("resolves R2 credentials from referenced secrets", () => {
	const secrets = new Map([
		["obsidian-sync-access", "replacement-access-key"],
		["obsidian-sync-secret", "replacement-secret-key"],
	]);
	const store = {
		getSecret(id: string): string | null {
			return secrets.get(id) ?? null;
		},
		setSecret(): void {},
	};

	const credentials = resolveR2Credentials(
		{
			r2AccessKeyIdSecretName: "obsidian-sync-access",
			r2SecretAccessKeySecretName: "obsidian-sync-secret",
		},
		store
	);

	assert.deepEqual(credentials, {
		accessKeyId: "replacement-access-key",
		secretAccessKey: "replacement-secret-key",
	});
});

test("returns null for empty secret references without accessing storage", () => {
	const store = {
		getSecret(): string | null {
			throw new Error("storage must not be called for empty IDs");
		},
		setSecret(): void {},
	};

	const credentials = resolveR2Credentials(
		{ r2AccessKeyIdSecretName: "", r2SecretAccessKeySecretName: "" },
		store
	);

	assert.equal(credentials, null);
});

test("returns null for aliased credential references without accessing storage", () => {
	const store = {
		getSecret(): string | null {
			throw new Error("storage must not be called for aliased IDs");
		},
		setSecret(): void {},
	};

	const credentials = resolveR2Credentials(
		{
			r2AccessKeyIdSecretName: "shared-r2-secret",
			r2SecretAccessKeySecretName: "shared-r2-secret",
		},
		store
	);

	assert.equal(credentials, null);
});

test("migrates legacy plaintext credentials out of persisted settings", async () => {
	const { DEFAULT_ACCESS_KEY_SECRET_NAME, DEFAULT_SECRET_KEY_SECRET_NAME, migrateLegacyR2Credentials } =
		await import("../src/credentials.ts");
	const secrets = new Map<string, string>();
	const store = {
		getSecret(id: string): string | null {
			return secrets.get(id) ?? null;
		},
		setSecret(id: string, secret: string): void {
			secrets.set(id, secret);
		},
	};

	const result = migrateLegacyR2Credentials(
		{
			r2AccessKeyIdSecretName: "",
			r2SecretAccessKeySecretName: "",
			r2AccessKeyId: "legacy-access-key",
			r2SecretAccessKey: "legacy-secret-key",
		},
		store
	);

	assert.equal(result.migrated, true);
	assert.equal(result.settings.r2AccessKeyIdSecretName, DEFAULT_ACCESS_KEY_SECRET_NAME);
	assert.equal(result.settings.r2SecretAccessKeySecretName, DEFAULT_SECRET_KEY_SECRET_NAME);
	assert.equal(secrets.get(DEFAULT_ACCESS_KEY_SECRET_NAME), "legacy-access-key");
	assert.equal(secrets.get(DEFAULT_SECRET_KEY_SECRET_NAME), "legacy-secret-key");
	assert.equal("r2AccessKeyId" in result.settings, false);
	assert.equal("r2SecretAccessKey" in result.settings, false);
});

test("fills missing referenced secrets before removing legacy plaintext", async () => {
	const { migrateLegacyR2Credentials } = await import("../src/credentials.ts");
	const secrets = new Map<string, string>();
	const store = {
		getSecret(id: string): string | null {
			return secrets.get(id) ?? null;
		},
		setSecret(id: string, secret: string): void {
			secrets.set(id, secret);
		},
	};

	const result = migrateLegacyR2Credentials(
		{
			r2AccessKeyIdSecretName: "custom-access-key",
			r2SecretAccessKeySecretName: "custom-secret-key",
			r2AccessKeyId: "legacy-access-key",
			r2SecretAccessKey: "legacy-secret-key",
		},
		store
	);

	assert.equal(secrets.get("custom-access-key"), "legacy-access-key");
	assert.equal(secrets.get("custom-secret-key"), "legacy-secret-key");
	assert.equal(result.settings.r2AccessKeyIdSecretName, "custom-access-key");
	assert.equal(result.settings.r2SecretAccessKeySecretName, "custom-secret-key");
	assert.equal("r2AccessKeyId" in result.settings, false);
	assert.equal("r2SecretAccessKey" in result.settings, false);
});

test("does not overwrite existing referenced secrets", async () => {
	const { migrateLegacyR2Credentials } = await import("../src/credentials.ts");
	const secrets = new Map<string, string>([
		["custom-access-key", "current-access-key"],
		["custom-secret-key", "current-secret-key"],
	]);
	const store = {
		getSecret(id: string): string | null {
			return secrets.get(id) ?? null;
		},
		setSecret(id: string, secret: string): void {
			secrets.set(id, secret);
		},
	};

	const result = migrateLegacyR2Credentials(
		{
			r2AccessKeyIdSecretName: "custom-access-key",
			r2SecretAccessKeySecretName: "custom-secret-key",
			r2AccessKeyId: "stale-access-key",
			r2SecretAccessKey: "stale-secret-key",
		},
		store
	);

	assert.equal(secrets.get("custom-access-key"), "current-access-key");
	assert.equal(secrets.get("custom-secret-key"), "current-secret-key");
	assert.equal("r2AccessKeyId" in result.settings, false);
	assert.equal("r2SecretAccessKey" in result.settings, false);
});

test("aborts legacy migration when explicit references alias the same secret", async () => {
	const { migrateLegacyR2Credentials } = await import("../src/credentials.ts");
	const source = {
		r2AccessKeyIdSecretName: "shared-r2-secret",
		r2SecretAccessKeySecretName: "shared-r2-secret",
		r2AccessKeyId: "legacy-access-key",
		r2SecretAccessKey: "legacy-secret-key",
	};
	let writes = 0;
	const store = {
		getSecret(): string | null {
			return null;
		},
		setSecret(): void {
			writes += 1;
		},
	};

	assert.throws(
		() => migrateLegacyR2Credentials(source, store),
		/same SecretStorage ID/
	);
	assert.equal(writes, 0);
	assert.equal(source.r2AccessKeyId, "legacy-access-key");
	assert.equal(source.r2SecretAccessKey, "legacy-secret-key");
});

test("aborts legacy migration when implicit and explicit references alias", async () => {
	const { DEFAULT_ACCESS_KEY_SECRET_NAME, migrateLegacyR2Credentials } =
		await import("../src/credentials.ts");
	const source = {
		r2AccessKeyIdSecretName: "",
		r2SecretAccessKeySecretName: DEFAULT_ACCESS_KEY_SECRET_NAME,
		r2AccessKeyId: "legacy-access-key",
		r2SecretAccessKey: "legacy-secret-key",
	};
	let writes = 0;
	const store = {
		getSecret(): string | null {
			return null;
		},
		setSecret(): void {
			writes += 1;
		},
	};

	assert.throws(
		() => migrateLegacyR2Credentials(source, store),
		/same SecretStorage ID/
	);
	assert.equal(writes, 0);
	assert.equal(source.r2AccessKeyId, "legacy-access-key");
	assert.equal(source.r2SecretAccessKey, "legacy-secret-key");
});

test("aborts implicit migration when default secret names contain different credentials", async () => {
	const {
		DEFAULT_ACCESS_KEY_SECRET_NAME,
		DEFAULT_SECRET_KEY_SECRET_NAME,
		migrateLegacyR2Credentials,
	} = await import("../src/credentials.ts");
	const source = {
		r2AccessKeyIdSecretName: "",
		r2SecretAccessKeySecretName: "",
		r2AccessKeyId: "legacy-access-key",
		r2SecretAccessKey: "legacy-secret-key",
	};
	const secrets = new Map<string, string>([
		[DEFAULT_ACCESS_KEY_SECRET_NAME, "unrelated-access-key"],
		[DEFAULT_SECRET_KEY_SECRET_NAME, "unrelated-secret-key"],
	]);
	let writes = 0;
	const store = {
		getSecret(id: string): string | null {
			return secrets.get(id) ?? null;
		},
		setSecret(): void {
			writes += 1;
		},
	};

	assert.throws(
		() => migrateLegacyR2Credentials(source, store),
		/implicit secret name is already in use/
	);
	assert.equal(writes, 0);
	assert.equal(source.r2AccessKeyId, "legacy-access-key");
	assert.equal(source.r2SecretAccessKey, "legacy-secret-key");
	assert.equal(source.r2AccessKeyIdSecretName, "");
	assert.equal(source.r2SecretAccessKeySecretName, "");
	assert.equal(secrets.get(DEFAULT_ACCESS_KEY_SECRET_NAME), "unrelated-access-key");
	assert.equal(secrets.get(DEFAULT_SECRET_KEY_SECRET_NAME), "unrelated-secret-key");
});

test("leaves source plaintext intact when secret storage throws", async () => {
	const { DEFAULT_SECRET_KEY_SECRET_NAME, migrateLegacyR2Credentials } =
		await import("../src/credentials.ts");
	const source = {
		r2AccessKeyIdSecretName: "",
		r2SecretAccessKeySecretName: "",
		r2AccessKeyId: "legacy-access-key",
		r2SecretAccessKey: "legacy-secret-key",
	};
	const store = {
		getSecret(): string | null {
			return null;
		},
		setSecret(id: string): void {
			if (id === DEFAULT_SECRET_KEY_SECRET_NAME) throw new Error("storage unavailable");
		},
	};

	assert.throws(() => migrateLegacyR2Credentials(source, store), /storage unavailable/);
	assert.equal(source.r2AccessKeyId, "legacy-access-key");
	assert.equal(source.r2SecretAccessKey, "legacy-secret-key");
	assert.equal(source.r2AccessKeyIdSecretName, "");
	assert.equal(source.r2SecretAccessKeySecretName, "");
});
