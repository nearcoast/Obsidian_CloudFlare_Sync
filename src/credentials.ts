export interface SecretStorageLike {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

export interface R2SecretReferences {
	r2AccessKeyIdSecretName: string;
	r2SecretAccessKeySecretName: string;
}

export interface R2Credentials {
	accessKeyId: string;
	secretAccessKey: string;
}

export interface LegacyR2SecretSettings extends R2SecretReferences {
	r2AccessKeyId?: string;
	r2SecretAccessKey?: string;
}

export const DEFAULT_ACCESS_KEY_SECRET_NAME = "remote-sync-r2-access-key-id";
export const DEFAULT_SECRET_KEY_SECRET_NAME = "remote-sync-r2-secret-access-key";

export function resolveR2Credentials(
	settings: R2SecretReferences,
	secretStorage: SecretStorageLike
): R2Credentials | null {
	if (
		!settings.r2AccessKeyIdSecretName ||
		!settings.r2SecretAccessKeySecretName ||
		settings.r2AccessKeyIdSecretName === settings.r2SecretAccessKeySecretName
	) {
		return null;
	}
	const accessKeyId = secretStorage.getSecret(settings.r2AccessKeyIdSecretName);
	const secretAccessKey = secretStorage.getSecret(settings.r2SecretAccessKeySecretName);

	if (!accessKeyId || !secretAccessKey) return null;
	return { accessKeyId, secretAccessKey };
}

export function migrateLegacyR2Credentials<T extends LegacyR2SecretSettings>(
	settings: T,
	secretStorage: SecretStorageLike
): { settings: T; migrated: boolean } {
	const migratedSettings = { ...settings };
	const hadAccessKey = Object.prototype.hasOwnProperty.call(migratedSettings, "r2AccessKeyId");
	const hadSecretKey = Object.prototype.hasOwnProperty.call(migratedSettings, "r2SecretAccessKey");

	const accessKeySecretName = migratedSettings.r2AccessKeyId
		? migratedSettings.r2AccessKeyIdSecretName || DEFAULT_ACCESS_KEY_SECRET_NAME
		: null;
	const secretKeySecretName = migratedSettings.r2SecretAccessKey
		? migratedSettings.r2SecretAccessKeySecretName || DEFAULT_SECRET_KEY_SECRET_NAME
		: null;

	if (
		migratedSettings.r2AccessKeyId &&
		migratedSettings.r2SecretAccessKey &&
		accessKeySecretName &&
		accessKeySecretName === secretKeySecretName
	) {
		throw new Error("Cannot migrate R2 credentials to the same SecretStorage ID");
	}

	const existingAccessKey = accessKeySecretName ? secretStorage.getSecret(accessKeySecretName) : null;
	const existingSecretKey = secretKeySecretName ? secretStorage.getSecret(secretKeySecretName) : null;

	if (
		migratedSettings.r2AccessKeyId &&
		!migratedSettings.r2AccessKeyIdSecretName &&
		existingAccessKey &&
		existingAccessKey !== migratedSettings.r2AccessKeyId
	) {
		throw new Error("Cannot migrate R2 credentials because an implicit secret name is already in use");
	}
	if (
		migratedSettings.r2SecretAccessKey &&
		!migratedSettings.r2SecretAccessKeySecretName &&
		existingSecretKey &&
		existingSecretKey !== migratedSettings.r2SecretAccessKey
	) {
		throw new Error("Cannot migrate R2 credentials because an implicit secret name is already in use");
	}

	if (migratedSettings.r2AccessKeyId && accessKeySecretName) {
		if (!existingAccessKey) {
			secretStorage.setSecret(accessKeySecretName, migratedSettings.r2AccessKeyId);
		}
		migratedSettings.r2AccessKeyIdSecretName = accessKeySecretName;
	}
	if (migratedSettings.r2SecretAccessKey && secretKeySecretName) {
		if (!existingSecretKey) {
			secretStorage.setSecret(secretKeySecretName, migratedSettings.r2SecretAccessKey);
		}
		migratedSettings.r2SecretAccessKeySecretName = secretKeySecretName;
	}

	delete migratedSettings.r2AccessKeyId;
	delete migratedSettings.r2SecretAccessKey;
	return { settings: migratedSettings, migrated: hadAccessKey || hadSecretKey };
}
