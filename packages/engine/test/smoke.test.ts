import { expect, test } from 'vitest';
import { ENGINE_NAME } from '../src/index.ts';

test('engine package loads', () => {
  expect(ENGINE_NAME).toBe('campusward-engine');
});

test('exposes every module through the package entry point', async () => {
  const engine = await import('../src/index.ts');
  for (const name of ['parseMeetings', 'parseTerm', 'rowToCourse', 'applyCorrections', 'evaluateEligibility', 'findConflicts', 'calculateInternshipPlan', 'searchCourses', 'checkEnrollmentRules', 'applyChanges', 'applyAiChangeSet', 'matchRecognizedCourses', 'maximumCreditSelection', 'loadStoredData']) {
    expect(typeof (engine as Record<string, unknown>)[name]).toBe('function');
  }
});
