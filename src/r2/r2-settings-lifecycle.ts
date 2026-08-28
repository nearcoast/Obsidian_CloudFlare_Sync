export interface R2ClientLifecycleHost {
	saveSettings(): Promise<void>;
	restartSyncEngine(): Promise<void>;
}

const lifecycleQueues = new WeakMap<R2ClientLifecycleHost, Promise<void>>();

export async function persistAndRestartR2Client(host: R2ClientLifecycleHost): Promise<void> {
	const previous = lifecycleQueues.get(host) ?? Promise.resolve();
	const current = previous.catch(() => undefined).then(async () => {
		await host.saveSettings();
		await host.restartSyncEngine();
	});
	lifecycleQueues.set(host, current);

	try {
		await current;
	} finally {
		if (lifecycleQueues.get(host) === current) {
			lifecycleQueues.delete(host);
		}
	}
}
