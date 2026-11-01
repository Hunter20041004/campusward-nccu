import { describe, expect, test } from 'vitest';
import { MARK, RULES, scrub } from '../scrub.ts';
import { COLLAPSE_CASE, NEGATIVE_CASES, POSITIVE_CASES } from './fixtures/synthetic/contacts.ts';

test('rules run in the reference order: links and e-mails before phones', () => {
  expect(RULES.map(([name]) => name)).toEqual([
    'meeting_link', 'line', 'social', 'email', 'email_obfuscated',
    'phone_labelled', 'mobile', 'landline', 'nccu_local', 'extension', 'student_id',
  ]);
  for (const [, pattern] of RULES) expect(pattern.flags).toBe('giu');
});

describe('each rule removes its kind of contact', () => {
  test.each(POSITIVE_CASES)('%s: %s', (rule, input, expected) => {
    const result = scrub(input);
    expect(result.text).toBe(expected);
    expect(result.hits[rule]).toBeGreaterThan(0);
  });
});

test('adjacent marks collapse into one', () => {
  expect(scrub(COLLAPSE_CASE[0]).text).toBe(COLLAPSE_CASE[1]);
});

test.each(NEGATIVE_CASES)('keeps ordinary numbers and words: %s', (input) => {
  expect(scrub(input)).toEqual({ text: input, hits: {} });
});

test('counts every match and leaves empty text alone', () => {
  expect(scrub('')).toEqual({ text: '', hits: {} });
  const twoMails = `${'a.test'}@nccu.edu.tw 與 ${'b.test'}@nccu.edu.tw 都可以`;
  expect(scrub(twoMails)).toEqual({ text: `${MARK} 與 ${MARK} 都可以`, hits: { email: 2 } });
});

test('is stable when run twice', () => {
  for (const [, input] of POSITIVE_CASES) {
    const once = scrub(input).text;
    expect(scrub(once)).toEqual({ text: once, hits: {} });
  }
});
