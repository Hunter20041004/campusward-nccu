import { expect, test } from 'vitest';
import { featuresFrom } from './features.ts';

test('turns features off by name and leaves the rest on', () => {
  expect(featuresFrom('qa, career')).toEqual({ orb: true, demo: true, qa: false, career: false, screenshot: true, graduation: true, liveCheck: true });
  expect(Object.values(featuresFrom(undefined)).every(Boolean)).toBe(true);
});
