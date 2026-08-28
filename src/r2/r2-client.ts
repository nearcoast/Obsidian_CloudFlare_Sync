import {
	S3Client,
	ListObjectsV2Command,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { RemoteSyncSettings } from "../settings";
import type { R2Credentials } from "../credentials";
import { ObsidianHttpHandler } from "./obsidian-http-handler";
import { copyUint8ArrayToArrayBuffer } from "./bytes";
import { buildR2Endpoint } from "./r2-config";
import { sanitizeR2Error } from "./safe-error";

export interface R2Object {
	key: string;
	size: number;
	etag: string;
	lastModified: Date;
}

export class R2Client {
	private client: S3Client;
	private bucket: string;

	constructor(settings: RemoteSyncSettings, credentials: R2Credentials) {
		this.bucket = settings.r2BucketName;
		const endpoint = buildR2Endpoint(settings.r2AccountId, settings.r2Jurisdiction);
		this.client = new S3Client({
			endpoint,
			region: "auto",
			credentials: {
				accessKeyId: credentials.accessKeyId,
				secretAccessKey: credentials.secretAccessKey,
			},
			requestHandler: new ObsidianHttpHandler(),
		});
	}

	async testConnection(): Promise<boolean> {
		const testKey = ".remote-sync-test";
		try {
			// Write
			await this.client.send(
				new PutObjectCommand({
					Bucket: this.bucket,
					Key: testKey,
					Body: new Uint8Array([116, 101, 115, 116]), // "test"
				})
			);
			// Read
			await this.client.send(
				new GetObjectCommand({
					Bucket: this.bucket,
					Key: testKey,
				})
			);
			// Delete
			await this.client.send(
				new DeleteObjectCommand({
					Bucket: this.bucket,
					Key: testKey,
				})
			);
			return true;
		} catch (e) {
			console.error("Remote Sync: testConnection failed", sanitizeR2Error(e));
			return false;
		}
	}

	async listObjects(prefix?: string): Promise<R2Object[]> {
		const objects: R2Object[] = [];
		let continuationToken: string | undefined;

		do {
			const response = await this.client.send(
				new ListObjectsV2Command({
					Bucket: this.bucket,
					Prefix: prefix,
					ContinuationToken: continuationToken,
				})
			);

			if (response.Contents) {
				for (const obj of response.Contents) {
					if (obj.Key && obj.Size !== undefined && obj.ETag && obj.LastModified) {
						objects.push({
							key: obj.Key,
							size: obj.Size,
							etag: obj.ETag.replace(/"/g, ""),
							lastModified: obj.LastModified,
						});
					}
				}
			}

			continuationToken = response.IsTruncated
				? response.NextContinuationToken
				: undefined;
		} while (continuationToken);

		return objects;
	}

	async uploadObject(
		key: string,
		body: ArrayBuffer,
		metadata?: Record<string, string>
	): Promise<string> {
		const response = await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: new Uint8Array(body),
				Metadata: metadata,
			})
		);
		return (response.ETag ?? "").replace(/"/g, "");
	}

	async downloadObject(key: string): Promise<ArrayBuffer> {
		const response = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);

		if (!response.Body) {
			throw new Error(`Empty response body for key: ${key}`);
		}

		const bytes = await response.Body.transformToByteArray();
		return copyUint8ArrayToArrayBuffer(bytes);
	}

	async deleteObject(key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);
	}
}
