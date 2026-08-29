export function arrayBuffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
	if (left.byteLength !== right.byteLength) return false;
	const leftBytes = new Uint8Array(left);
	const rightBytes = new Uint8Array(right);
	for (let i = 0; i < leftBytes.length; i++) {
		if (leftBytes[i] !== rightBytes[i]) return false;
	}
	return true;
}
