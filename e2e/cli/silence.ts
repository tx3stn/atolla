export interface SilenceFormat {
	bits: number;
	rate: number;
}

const LOW_RATE: SilenceFormat = { bits: 16, rate: 8000 };

export function silence(seconds: number, format: SilenceFormat = LOW_RATE): Buffer {
	const blockAlign = format.bits / 8;
	const data = format.rate * seconds * blockAlign;
	const buffer = Buffer.alloc(44 + data);

	buffer.write('RIFF', 0, 'ascii');
	buffer.writeUInt32LE(36 + data, 4);
	buffer.write('WAVEfmt ', 8, 'ascii');
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(format.rate, 24);
	buffer.writeUInt32LE(format.rate * blockAlign, 28);
	buffer.writeUInt16LE(blockAlign, 32);
	buffer.writeUInt16LE(format.bits, 34);
	buffer.write('data', 36, 'ascii');
	buffer.writeUInt32LE(data, 40);

	return buffer;
}
