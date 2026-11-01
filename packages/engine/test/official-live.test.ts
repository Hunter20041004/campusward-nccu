import { describe, expect, test } from 'vitest';
import { checkCourseLive, officialQueryUrl } from '../src/official/live.ts';
import { rowToCourse } from '../src/official/course.ts';
import { officialRow, TERM } from './fixtures/synthetic/official-rows.ts';

// 計畫 3.2：單門課即時向官方確認。只送課號到政大公開查詢。
const course = rowToCourse(officialRow(), TERM).course!;
const respond = (body: unknown, status = 200) => async () => ({ ok: status < 400, json: async () => body });

describe('checkCourseLive', () => {
  test('builds the official query URL with only the term and the course code', () => {
    expect(decodeURIComponent(officialQueryUrl('1151', '900123001').href)).toBe('https://es.nccu.edu.tw/course/zh-TW/:sem=1151 900123001 /');
  });

  test('says the snapshot matches the official data', async () => {
    expect(await checkCourseLive(course, respond([officialRow({ subNum: '900123002' }), officialRow()]))).toEqual({ status: 'same' });
  });

  test('lists what the school changed', async () => {
    const result = await checkCourseLive(course, respond([officialRow({ teaNam: '李合成', subTime: '五D56', subClassroom: '綜合270101' })]));
    expect(result).toMatchObject({ status: 'changed', fields: ['teacher', 'scheduleText', 'classroom', 'meetings'] });
    expect(result.status === 'changed' && result.live.teacher).toBe('李合成');
  });

  test('reports a course the school no longer lists', async () => {
    expect(await checkCourseLive(course, respond([]))).toEqual({ status: 'missing' });
  });

  test('reports a failed request without throwing', async () => {
    expect(await checkCourseLive(course, respond({}, 503))).toEqual({ status: 'failed' });
    expect(await checkCourseLive(course, async () => { throw new TypeError('offline'); })).toEqual({ status: 'failed' });
  });
});
