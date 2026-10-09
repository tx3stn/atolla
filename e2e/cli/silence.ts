const RATE = 8000;

export function silence(seconds: number): Buffer {
	const samples = RATE * seconds;
	const data = samples * 2;
	const buffer = Buffer.alloc(44 + data);

	buffer.write('RIFF', 0, 'ascii');
	buffer.writeUInt32LE(36 + data, 4);
	buffer.write('WAVEfmt ', 8, 'ascii');
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(RATE, 24);
	buffer.writeUInt32LE(RATE * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write('data', 36, 'ascii');
	buffer.writeUInt32LE(data, 40);

	return buffer;
}
