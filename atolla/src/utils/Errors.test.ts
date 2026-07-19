import { describe, expect, it } from 'bun:test';
import { ErrorConst, isErrorConst, toErrorConst } from './Errors';

const FALLBACK: ErrorConst<string> = new ErrorConst('fallback', 'connection error');

describe('isErrorConst', () => {
	it('is true for an ErrorConst', () => {
		expect(isErrorConst(new ErrorConst('code', 'something broke'))).toBe(true);
	});

	// the guard exists to keep non-ErrorConst throws away from the view's .msg() call, so it must
	// be an instanceof check rather than duck typing on the shape
	it('is false for a plain object that looks like one', () => {
		expect(isErrorConst({ err: 'code', message: 'something broke', msg: () => 'x' })).toBe(false);
	});

	it('is false for the values a catch block can actually receive', () => {
		for (const value of [new TypeError('not a function'), null, undefined, 'boom', 42]) {
			expect(isErrorConst(value)).toBe(false);
		}
	});
});

describe('toErrorConst', () => {
	it('passes an existing ErrorConst through untouched', () => {
		const original = new ErrorConst('code', 'something broke');
		expect(toErrorConst(original, FALLBACK)).toBe(original);
	});

	it('preserves a detail already attached to the cause', () => {
		const detailed = new ErrorConst('code', 'something broke').withDetail('HTTP 500');
		expect(toErrorConst(detailed, FALLBACK).msg()).toBe('something broke: HTTP 500');
	});

	it('falls back and keeps a native Error message as the detail', () => {
		const result = toErrorConst(new TypeError('store gone'), FALLBACK);

		expect(result.err).toBe('fallback');
		expect(result.msg()).toBe('connection error: store gone');
	});

	it('falls back and keeps a thrown string as the detail', () => {
		expect(toErrorConst('boom', FALLBACK).msg()).toBe('connection error: boom');
	});

	it('falls back to the bare error when no detail can be recovered', () => {
		expect(toErrorConst(undefined, FALLBACK)).toBe(FALLBACK);
		expect(toErrorConst({ nope: true }, FALLBACK)).toBe(FALLBACK);
	});

	it('never mutates the fallback while attaching a detail', () => {
		toErrorConst(new Error('one'), FALLBACK);
		toErrorConst(new Error('two'), FALLBACK);

		expect(FALLBACK.detail).toBe('');
		expect(FALLBACK.msg()).toBe('connection error');
	});
});
