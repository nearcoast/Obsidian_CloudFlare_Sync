import { requestUrl } from "obsidian";
import type { HttpHandler, HttpRequest, HttpResponse } from "@smithy/protocol-http";
import { buildQueryString } from "@smithy/querystring-builder";
import { sanitizeR2Error } from "./safe-error";

/** Abort if a request hasn't resolved within this window (ms). */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Routes AWS SDK requests through Obsidian's `requestUrl()` instead of Node's
 * http/https stack. This is required on mobile (no Node `http`) and avoids CORS
 * on desktop, so the same code path works on both platforms.
 */
export class ObsidianHttpHandler implements Pick<HttpHandler, "handle" | "destroy"> {
	async handle(
		request: HttpRequest,
		{ abortSignal }: { abortSignal?: AbortSignal } = {}
	): Promise<{ response: HttpResponse }> {
		// Build the query string with the SDK's own encoder so it matches the
		// canonical form SigV4 signed (hand-rolled encodeURIComponent differs for
		// chars like base64 `+ / =` in ContinuationToken → SignatureDoesNotMatch).
		const queryString = request.query ? buildQueryString(request.query) : "";
		const portPart = request.port ? `:${request.port}` : "";
		const base = `${request.protocol}//${request.hostname}${portPart}${request.path}`;
		const fullUrl = queryString ? `${base}?${queryString}` : base;

		// Convert body to a form requestUrl accepts.
		let body: string | ArrayBuffer | undefined;
		if (request.body instanceof Uint8Array) {
			// Copy into a fresh ArrayBuffer (avoids SharedArrayBuffer in the union
			// and any offset into a larger backing buffer).
			const copy = new Uint8Array(request.body.byteLength);
			copy.set(request.body);
			body = copy.buffer;
		} else if (request.body instanceof ArrayBuffer) {
			body = request.body;
		} else if (typeof request.body === "string") {
			body = request.body;
		}

		// Drop headers that Obsidian/the platform sets itself; keep the signed
		// auth headers (authorization, x-amz-*) intact.
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(request.headers)) {
			const lower = key.toLowerCase();
			if (lower === "host" || lower === "content-length" || lower === "transfer-encoding") {
				continue;
			}
			headers[key] = value;
		}

		const response = await this.send(fullUrl, request.method, headers, body, abortSignal);

		// Normalize header keys to lowercase so the S3 deserializer reliably reads
		// e.g. `etag` regardless of how the platform cased them.
		const responseHeaders: Record<string, string> = {};
		for (const [key, value] of Object.entries(response.headers ?? {})) {
			responseHeaders[key.toLowerCase()] = value as string;
		}

		// Guard empty bodies (PUT/DELETE often have none).
		const arrayBuffer = response.arrayBuffer ?? new ArrayBuffer(0);
		const responseBody = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(arrayBuffer));
				controller.close();
			},
		});

		return {
			response: {
				statusCode: response.status,
				headers: responseHeaders,
				body: responseBody,
			} as HttpResponse,
		};
	}

	/** Run requestUrl with a timeout + abort guard so a stuck request surfaces as
	 * a thrown error instead of hanging the sync cycle forever. */
	private async send(
		url: string,
		method: string,
		headers: Record<string, string>,
		body: string | ArrayBuffer | undefined,
		abortSignal?: AbortSignal
	): Promise<ReturnType<typeof requestUrl> extends Promise<infer R> ? R : never> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const requestPromise = requestUrl({
				url,
				method,
				headers,
				body,
				throw: false,
			});

			const timeoutPromise = new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${url}`)),
					REQUEST_TIMEOUT_MS
				);
				if (abortSignal) {
					if (abortSignal.aborted) {
						reject(new Error(`Request aborted: ${method} ${url}`));
					} else {
						abortSignal.addEventListener(
							"abort",
							() => reject(new Error(`Request aborted: ${method} ${url}`)),
							{ once: true }
						);
					}
				}
			});

			return await Promise.race([requestPromise, timeoutPromise]);
		} catch (e) {
			console.error("Remote Sync: request failed", {
				method,
				...sanitizeR2Error(e),
			});
			throw e;
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	destroy(): void {}
}
