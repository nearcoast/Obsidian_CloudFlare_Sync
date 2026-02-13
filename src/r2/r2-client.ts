import {
	S3Client,
	ListObjectsV2Command,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { RemoteSyncSettings } from "../settings";

export interface R2Object {
	key: string;
	size: number;
	etag: string;
	lastModified: Date;
}

export class R2Client {
	private client: S3Client;
	private bucket: string;

	constructor(settings: RemoteSyncSettings) {
		this.bucket = settings.r2BucketName;
		const jur = settings.r2Jurisdiction;
		const jurPart = jur ? `.${jur}` : "";
		this.client = new S3Client({
			endpoint: `https://${settings.r2AccountId}${jurPart}.r2.cloudflarestorage.com`,
			region: "auto",
			credentials: {
				accessKeyId: settings.r2AccessKeyId,
				secretAccessKey: settings.r2SecretAccessKey,
			},
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
		} catch {
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

		return await response.Body.transformToByteArray();
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
