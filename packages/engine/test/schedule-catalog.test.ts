import { describe, expect, test } from 'vitest';
import corrections1151 from '../../../data/corrections/1151.json' with { type: 'json' };
import { applyCorrections, parseCorrections } from '../src/official/corrections.ts';
import { rowToCourse } from '../src/official/course.ts';
import { buildScheduleAgenda } from '../src/schedule/agenda.ts';
import {
  buildCandidateCatalog,
  createManualCourse,
  deleteCandidate,
  restoreOfficialCatalog,
  toScheduleCourse,
  validateManualCourse,
} from '../src/schedule/catalog.ts';
import type { PlanItem, ScheduleCourse } from '../src/schedule/selection.ts';
import { officialRow, TERM } from './fixtures/synthetic/official-rows.ts';

// 移植自舊專案 tests/planner-core.test.mjs（手動課程、候選清單）與 tests/schedule-agenda.test.mjs。

const stub = (key: string, source: ScheduleCourse['source'] = 'official'): ScheduleCourse => ({
  key, title: key, credits: 3, itemType: 'course', meetings: [], events: [],
  delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' }, eligibility: {}, source,
});
const item = (key: string, extra: Partial<PlanItem> = {}): PlanItem => ({ key, attendance: 'sync', status: 'planned', locked: false, ...extra });

describe('toScheduleCourse', () => {
  test('keys an official course by term and code and keeps its official rules', () => {
    const { course } = rowToCourse(officialRow({ note: '＠備註:僅限合成系學生修讀' }), TERM);
    const scheduled = toScheduleCourse(course!);
    expect(scheduled).toMatchObject({ key: '1151:900123001', title: '合成課程概論', code: '900123001', teacher: '王合成', credits: 3, itemType: 'course', source: 'official' });
    expect(scheduled.meetings).toEqual([{ day: 4, start: 790, end: 960, label: '四D56' }]);
    expect(scheduled.eligibility.eligibilityRules?.[0]?.conditionId).toBe('official-restriction:900123001');
  });

  test('carries a schedule correction into the schedule course', () => {
    const { course } = rowToCourse(officialRow({ subNum: '070424001', subTime: '未定或彈性' }), TERM);
    const scheduled = toScheduleCourse(applyCorrections(course!, parseCorrections(corrections1151)));
    expect(scheduled.correctionId).toBe('nccu-1151-taica-070424001');
    expect(scheduled.delivery.defaultAttendance).toBe('async');
  });
});

describe('manual courses', () => {
  test('normalizes a manually entered physical course into a schedulable block', () => {
    expect(createManualCourse({ title: '使用者新增課程', credits: '2', day: '2', start: '09:10', end: '12:00', mode: 'physical' }, 7)).toEqual({
      key: 'manual-7',
      title: '使用者新增課程',
      itemType: 'course',
      credits: 2,
      source: 'manual',
      meetings: [{ day: 2, start: 550, end: 720, label: '週二 234' }],
      events: [],
      delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' },
      eligibility: {},
      note: '手動新增，尚未查證官方資料',
    });
  });

  test('creates an asynchronous manual course without a weekly slot', () => {
    const remote = createManualCourse({ title: '線上課', credits: '1', mode: 'async', day: '1', start: '09:00', end: '10:00' }, 9);
    expect(remote.meetings).toEqual([]);
    expect(remote.delivery).toEqual({ mode: 'asynchronous', asyncAllowed: true, defaultAttendance: 'async' });
  });

  test('creates a weekly club activity that participates in scheduling', () => {
    const activity = createManualCourse({ title: '攝影社', itemType: 'club', credits: '3', mode: 'physical', day: '7', start: '14:00', end: '16:00' }, 8);
    expect(activity.itemType).toBe('club');
    expect(activity.credits).toBe(0);
    expect(activity.meetings[0]?.day).toBe(7);
    expect(activity.meetings[0]?.label).toBe('週日 14:00–16:00');
    expect(activity.note).toBe('自訂每週行程');
  });

  test('rejects a manual course without a name', () => {
    expect(validateManualCourse({ title: '  ', credits: 3, mode: 'physical', start: '09:00', end: '10:00' }))
      .toEqual({ field: 'title', message: '請輸入名稱。' });
  });

  test('rejects a manual course whose end is not after its start', () => {
    expect(validateManualCourse({ title: '測試課', credits: 3, mode: 'physical', start: '12:00', end: '09:00' }))
      .toEqual({ field: 'end', message: '結束時間必須晚於開始時間。' });
  });

  test('accepts only half-credit course values between zero and twelve', () => {
    const base = { title: '測試課', itemType: 'course' as const, mode: 'async' as const, start: '09:10', end: '12:00' };
    for (const credits of ['13', '-1', '0.3', '', 'not-a-number']) {
      expect(validateManualCourse({ ...base, credits })).toEqual({ field: 'credits', message: '課程學分必須是 0 到 12 之間，並以 0.5 學分為單位。' });
    }
    for (const credits of ['0', '0.5', '12']) {
      expect(validateManualCourse({ ...base, credits })).toBe(null);
    }
    expect(validateManualCourse({ ...base, itemType: 'club', credits: '' })).toBe(null);
  });

  test('reports invalid course credits before an invalid meeting time', () => {
    expect(validateManualCourse({ itemType: 'course', title: 'QA 課程', credits: 13, mode: 'physical', start: '12:00', end: '10:00' }))
      .toEqual({ field: 'credits', message: '課程學分必須是 0 到 12 之間，並以 0.5 學分為單位。' });
  });

  test('rejects malformed clock times', () => {
    expect(validateManualCourse({ title: '測試課', credits: 3, mode: 'physical', start: '9點', end: '10:00' }))
      .toEqual({ field: 'start', message: '請輸入 HH:MM 格式的時間。' });
  });
});

describe('candidate catalog', () => {
  test('restores the official catalog by removing manually added courses', () => {
    expect(restoreOfficialCatalog([stub('official'), stub('manual-1', 'manual')])).toEqual([stub('official')]);
  });

  test('deletes an optional candidate from both the catalog and selected schedule', () => {
    expect(deleteCandidate({ candidates: [stub('required'), stub('optional')], items: [item('required'), item('optional')] }, 'optional'))
      .toEqual({ candidates: [stub('required')], items: [item('required')], deleted: stub('optional') });
  });

  test('deletes any candidate and removes its selection and lock', () => {
    expect(deleteCandidate({ candidates: [stub('required')], items: [item('required', { locked: true })] }, 'required'))
      .toEqual({ candidates: [], items: [], deleted: stub('required') });
  });

  test('ignores deleting an unknown candidate', () => {
    const state = { candidates: [stub('a')], items: [item('a')] };
    expect(deleteCandidate(state, 'missing')).toEqual({ ...state, deleted: null });
  });

  test('rebuilds a saved catalog without deleted official candidates', () => {
    expect(buildCandidateCatalog([stub('keep'), stub('deleted')], [stub('manual-1', 'manual')], ['deleted']))
      .toEqual([stub('keep'), stub('manual-1', 'manual')]);
  });
});

describe('buildScheduleAgenda', () => {
  test('groups physical meetings by weekday and sorts them from morning to evening', () => {
    const at = (key: string, meetings: ScheduleCourse['meetings']) => ({ ...stub(key), title: key, meetings });
    const agenda = buildScheduleAgenda([
      { course: at('late', [{ day: 2, start: 780, end: 900, label: '' }]), item: item('late') },
      { course: at('multi', [{ day: 4, start: 610, end: 720, label: '' }, { day: 2, start: 490, end: 540, label: '' }]), item: item('multi') },
      { course: at('async', [{ day: 1, start: 490, end: 540, label: '' }]), item: item('async', { attendance: 'async' }) },
      { course: at('pending', []), item: item('pending') },
    ]);
    expect(agenda.days.map(({ day }) => day)).toEqual([2, 4]);
    expect(agenda.days[0]?.items.map(({ courseKey }) => courseKey)).toEqual(['multi', 'late']);
    expect(agenda.flexible.map(({ courseKey, reason }) => ({ courseKey, reason }))).toEqual([
      { courseKey: 'async', reason: '非同步' },
      { courseKey: 'pending', reason: '時間未定' },
    ]);
  });
});
