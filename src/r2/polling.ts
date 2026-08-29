export function scheduleRemotePoll<T>(
	setIntervalFn: (callback: () => void, milliseconds: number) => T,
	milliseconds: number,
	poll: () => void
): T {
	return setIntervalFn(poll, milliseconds);
}
