import { describe, expect, test } from 'vitest';
import { EXTRA_RULES, MARK, RULES, scrub, STUDENT_ID_CONTEXT_RULE } from '../scrub.ts';
import { COLLAPSE_CASE, COURSE_CODE_WITHOUT_STUDENT_ID, NEGATIVE_CASES, POSITIVE_CASES, TA_NOT_A_NAME } from './fixtures/synthetic/contacts.ts';

test('rules run in the reference order: links and e-mails before phones', () => {
  expect(RULES.map(([name]) => name)).toEqual([
    'meeting_link', 'line', 'social', 'email', 'email_obfuscated',
    'phone_labelled', 'mobile', 'landline', 'nccu_local', 'extension', 'student_id',
  ]);
  for (const [, pattern] of RULES) expect(pattern.flags).toBe('giu');
  expect(STUDENT_ID_CONTEXT_RULE).toBe('student_id_context');
  expect(EXTRA_RULES.map(([name]) => name)).toEqual(['link_key', 'landline_context', 'ta_name', 'ta_name_status']);
});

describe('each rule removes its kind of contact', () => {
  test.each(POSITIVE_CASES)('%s: %s', (rule, input, expected) => {
    const result = scrub(input);
    expect(result.text).toBe(expected);
    expect(result.hits[rule]).toBeGreaterThan(0);
  });
});

test('bare 9-digit numbers are kept when the text never mentions a student id', () => {
  expect(scrub(COURSE_CODE_WITHOUT_STUDENT_ID)).toEqual({ text: COURSE_CODE_WITHOUT_STUDENT_ID, hits: {} });
});

test('a word like 信箱 after 助教 is not taken for a name', () => {
  expect(scrub(TA_NOT_A_NAME)).toEqual({ text: TA_NOT_A_NAME, hits: {} });
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
