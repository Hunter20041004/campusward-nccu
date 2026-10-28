import { expect, test } from 'vitest';
import { ENGINE_NAME } from '../src/index.ts';

test('engine package loads', () => {
  expect(ENGINE_NAME).toBe('campusward-engine');
});
