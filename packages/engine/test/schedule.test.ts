import { describe, expect, test } from 'vitest';
import type { Meeting } from '../src/periods.ts';
import type { CourseEvent, Delivery } from '../src/official/course.ts';
import {
  addCourse,
  addSelectableCourse,
  candidateScheduleSummary,
  findConflicts,
  formatCourseEventReminder,
  lockCandidateCourse,
  refreshItems,
  removeCourse,
  setAttendance,
  setStatus,
  toggleCourse,
  toggleLock,
  totalCredits,
  type PlanItem,
  type ScheduleCourse,
} from '../src/schedule/selection.ts';

// 移植自舊專案 tests/planner-core.test.mjs 與 tests/course-reconciler.test.mjs。
// 舊版把官方課程與學生選擇混在同一物件（selected[]、lockedCourseIds、attendance）；
// 新版拆成 ScheduleCourse（課程）與 PlanItem（學生選擇）。'physical' 改稱 'sync'，單一 schedule 改為 meetings。

const SYNC_ONLY: Delivery = { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' };
const ASYNC_DEFAULT: Delivery = { mode: 'asynchronous-optional', asyncAllowed: true, defaultAttendance: 'async' };

function course(key: string, title: string, meetings: Omit<Meeting, 'label'>[] = [], extra: Partial<ScheduleCourse> = {}): ScheduleCourse {
  return {
    key,
    title,
    credits: 3,
    itemType: 'course',
    meetings: meetings.map((meeting) => ({ label: '', ...meeting })),
    events: [],
    delivery: SYNC_ONLY,
    eligibility: {},
    ...extra,
  };
}

const item = (key: string, attendance: PlanItem['attendance'] = 'sync', extra: Partial<PlanItem> = {}): PlanItem => ({
  key, attendance, status: 'planned', locked: false, ...extra,
});

const profile = { level: 'undergrad', year: 3, programs: ['innovation'], prerequisites: [] } as const;
const LABELS = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

describe('candidateScheduleSummary', () => {
  test('summarizes one or more NCCU candidate meetings', () => {
    expect(candidateScheduleSummary(course('a', 'A', [{ day: 4, start: 790, end: 960 }]), LABELS)).toBe('週四 D56');
    expect(candidateScheduleSummary(course('b', 'B', [
      { day: 2, start: 550, end: 720 },
      { day: 4, start: 790, end: 960 },
    ]), LABELS)).toBe('週二 234・週四 D56');
  });

  test('distinguishes asynchronous and undecided candidate times', () => {
    expect(candidateScheduleSummary(course('a', 'A', [{ day: 4, start: 790, end: 960 }]), LABELS, 'async')).toBe('非同步／時間彈性');
    expect(candidateScheduleSummary(course('b', 'B', [], { delivery: ASYNC_DEFAULT }), LABELS)).toBe('非同步／時間彈性');
    expect(candidateScheduleSummary(course('c', 'C'), LABELS)).toBe('時間未定');
  });
});

describe('findConflicts', () => {
  test('reports a weekly conflict when two selected physical courses overlap', () => {
    expect(findConflicts([
      { course: course('agentic', 'Agentic AI', [{ day: 4, start: 790, end: 960 }]), item: item('agentic') },
      { course: course('ai-tools', '人工智慧方法與工具', [{ day: 4, start: 790, end: 960 }]), item: item('ai-tools') },
    ])).toEqual([{
      type: 'weekly',
      courseKeys: ['agentic', 'ai-tools'],
      message: 'Agentic AI 與 人工智慧方法與工具 每週時段重疊',
    }]);
  });

  test('reports a conflict from any meeting of a multi-meeting course', () => {
    expect(findConflicts([
      { course: course('studio', '跨時段專題', [{ day: 2, start: 550, end: 720 }, { day: 4, start: 790, end: 960 }]), item: item('studio') },
      { course: course('agentic', 'Agentic AI', [{ day: 4, start: 790, end: 960 }]), item: item('agentic') },
    ])).toEqual([{
      type: 'weekly',
      courseKeys: ['studio', 'agentic'],
      message: '跨時段專題 與 Agentic AI 每週時段重疊',
    }]);
  });

  test('does not reserve the weekly slot when an allowed remote course is taken asynchronously', () => {
    expect(findConflicts([
      { course: course('agentic', 'Agentic AI', [{ day: 4, start: 790, end: 960 }]), item: item('agentic') },
      { course: course('ai-intro', '人工智慧導論', [{ day: 4, start: 790, end: 960 }], { delivery: ASYNC_DEFAULT }), item: item('ai-intro', 'async') },
    ])).toEqual([]);
  });

  test('restores a verified TAICA meeting to conflict checks when attendance switches to sync', () => {
    expect(findConflicts([
      { course: course('fintech', '金融科技導論', [{ day: 3, start: 550, end: 730 }], { delivery: ASYNC_DEFAULT }), item: item('fintech', 'sync') },
      { course: course('other', '週三實體課', [{ day: 3, start: 610, end: 720 }]), item: item('other') },
    ])).toEqual([{
      type: 'weekly',
      courseKeys: ['fintech', 'other'],
      message: '金融科技導論 與 週三實體課 每週時段重疊',
    }]);
  });

  test('keeps a synchronous exam as a hard conflict for an asynchronously attended course', () => {
    const exam: CourseEvent = { label: '實體考試', date: '2026-12-10', day: 4, start: 790, end: 960 };
    expect(findConflicts([
      { course: course('agentic', 'Agentic AI', [{ day: 4, start: 790, end: 960 }]), item: item('agentic') },
      { course: course('ai-intro', '人工智慧導論', [{ day: 4, start: 790, end: 960 }], { delivery: ASYNC_DEFAULT, events: [exam] }), item: item('ai-intro', 'async') },
    ])).toEqual([{
      type: 'event',
      courseKeys: ['ai-intro', 'agentic'],
      message: '人工智慧導論的實體考試與 Agentic AI 時段重疊',
    }]);
  });

  test('does not invent a conflict for a date-only TAICA obligation', () => {
    expect(findConflicts([
      { course: course('ml', '機器學習', [], { delivery: ASYNC_DEFAULT, events: [{ date: '2026-12-09', label: '實體同步考試，時間待確認' }] }), item: item('ml', 'async') },
      { course: course('other', '星期三課程', [{ day: 3, start: 550, end: 730 }]), item: item('other') },
    ])).toEqual([]);
  });
});

describe('formatCourseEventReminder', () => {
  test('formats a week-only course event reminder without an undefined date', () => {
    expect(formatCourseEventReminder({ title: '生成式 AI：文字與圖像生成的原理與實務' }, { week: 11, label: '第 11 週上機考' }))
      .toBe('生成式 AI：文字與圖像生成的原理與實務：第 11 週上機考');
  });

  test('formats a pending-time TAICA obligation without inventing a conflict time', () => {
    expect(formatCourseEventReminder({ title: '機器學習' }, { date: '2026-12-09', label: '實體同步考試，時間待確認' }))
      .toBe('機器學習：2026-12-09 實體同步考試，時間待確認');
  });
});

describe('adding, removing, and locking', () => {
  const hci = course('hci', '人機互動', [{ day: 4, start: 550, end: 720 }]);

  test('adds an available optional course to the selection', () => {
    expect(toggleCourse([], hci)).toEqual([item('hci')]);
  });

  test('removes a selected optional course', () => {
    expect(toggleCourse([item('hci')], hci)).toEqual([]);
  });

  test('removes an unlocked required course from the selection', () => {
    expect(removeCourse([item('agentic')], 'agentic')).toEqual([]);
  });

  test('keeps a locked required course in the selection', () => {
    const locked = item('agentic', 'sync', { locked: true });
    expect(removeCourse([locked], 'agentic')).toEqual([locked]);
    expect(toggleCourse([locked], course('agentic', 'Agentic AI'))).toEqual([locked]);
  });

  test('toggles a selected course lock on and off', () => {
    expect(toggleLock([item('agentic')], 'agentic')).toEqual([item('agentic', 'sync', { locked: true })]);
    expect(toggleLock([item('agentic', 'sync', { locked: true })], 'agentic')).toEqual([item('agentic')]);
  });

  test('adds and locks an unselected eligible candidate in one action', () => {
    expect(lockCandidateCourse([], hci, profile)).toEqual([item('hci', 'sync', { locked: true })]);
  });

  test('unlocks an already locked candidate without removing it', () => {
    expect(lockCandidateCourse([item('hci', 'sync', { locked: true })], hci, profile)).toEqual([item('hci')]);
  });

  test('does not add a blocked candidate when locking', () => {
    const blocked = course('grad', '碩士專題', [], { eligibility: { level: 'graduate' } });
    expect(lockCandidateCourse([], blocked, profile)).toEqual([]);
  });

  test('preserves a verified asynchronous default when adding a course', () => {
    const remote = course('ai-701889001', '生成式 AI', [], {
      delivery: { mode: 'asynchronous', asyncAllowed: true, defaultAttendance: 'async' },
      correctionId: 'fix-1',
    });
    expect(addCourse([], remote)).toEqual([item('ai-701889001', 'async', { correctionId: 'fix-1' })]);
  });

  test('adds a verified TAICA course with its asynchronous default and retained sync meeting', () => {
    const fintech = course('ai-070424001', '金融科技導論', [{ day: 3, start: 550, end: 730 }], { delivery: ASYNC_DEFAULT });
    expect(addSelectableCourse([], fintech, profile)).toEqual([item('ai-070424001', 'async')]);
  });

  test('adds an eligible catalog course to the schedule', () => {
    expect(addSelectableCourse([], hci, profile)).toEqual([item('hci')]);
  });

  test('does not add a course the student is blocked from or that is unavailable', () => {
    expect(addSelectableCourse([], course('grad', '碩士專題', [], { eligibility: { level: 'graduate' } }), profile)).toEqual([]);
    expect(addSelectableCourse([], course('gone', '停開課', [], { eligibility: { available: false } }), profile)).toEqual([]);
  });

  test('does not add the same course twice', () => {
    expect(addCourse([item('hci')], hci)).toEqual([item('hci')]);
  });
});

describe('attendance and status', () => {
  const fintech = course('fintech', '金融科技導論', [{ day: 3, start: 550, end: 730 }], { delivery: ASYNC_DEFAULT });

  test('switches an async-capable course between sync and async', () => {
    expect(setAttendance([item('fintech', 'async')], fintech, 'sync')).toEqual([item('fintech', 'sync')]);
  });

  test('refuses async attendance for a course that only allows sync', () => {
    const hci = course('hci', '人機互動', [{ day: 4, start: 550, end: 720 }]);
    expect(setAttendance([item('hci')], hci, 'async')).toEqual([item('hci')]);
  });

  // 新增（計畫 1.5）：已灌檔／已選上預設鎖定，AI 不會排掉
  test.each(['registered', 'enrolled'] as const)('locks a course marked %s', (status) => {
    expect(setStatus([item('hci')], 'hci', status)).toEqual([item('hci', 'sync', { status, locked: true })]);
  });

  test('keeps the lock when a registered course goes back to planned', () => {
    expect(setStatus([item('hci', 'sync', { status: 'registered', locked: true })], 'hci', 'planned'))
      .toEqual([item('hci', 'sync', { status: 'planned', locked: true })]);
  });
});

describe('totalCredits', () => {
  test('sums course credits and ignores weekly activities', () => {
    expect(totalCredits([
      { course: course('a', 'A', [], { credits: 3 }), item: item('a') },
      { course: course('b', 'B', [], { credits: 2.5 }), item: item('b') },
      { course: course('club', '攝影社', [], { credits: 0, itemType: 'club' }), item: item('club') },
    ])).toBe(5.5);
  });
});

// 移植自舊專案 tests/course-reconciler.test.mjs：官方資料更新時保留學生的選擇
describe('refreshItems', () => {
  const fixCourse = (correctionId?: string) => course('ai-701889001', '生成式 AI', [], {
    delivery: { mode: 'asynchronous', asyncAllowed: true, defaultAttendance: 'async' },
    ...(correctionId ? { correctionId } : {}),
  });

  test('refreshes official fields while preserving user-owned planning state', () => {
    const items = [item('ai-703055001', 'async', { status: 'registered', locked: true })];
    const catalog = new Map([['ai-703055001', course('ai-703055001', '人機互動', [], { delivery: ASYNC_DEFAULT })]]);
    expect(refreshItems(items, catalog)).toEqual(items);
  });

  test('applies a verified asynchronous correction immediately when refreshing a selected course', () => {
    const catalog = new Map([['ai-701889001', fixCourse('nccu-1151-701889001-one-time-exam')]]);
    expect(refreshItems([item('ai-701889001', 'sync')], catalog))
      .toEqual([item('ai-701889001', 'async', { correctionId: 'nccu-1151-701889001-one-time-exam' })]);
  });

  test('preserves an intentional attendance override after the schedule correction was already applied', () => {
    const catalog = new Map([['ai-701889001', fixCourse('nccu-1151-701889001-one-time-exam')]]);
    const overridden = item('ai-701889001', 'sync', { correctionId: 'nccu-1151-701889001-one-time-exam' });
    expect(refreshItems([overridden], catalog)).toEqual([overridden]);
  });

  test('keeps items whose course is missing from the refreshed catalog', () => {
    expect(refreshItems([item('gone')], new Map())).toEqual([item('gone')]);
  });

  test('falls back to sync when a refreshed course no longer allows async', () => {
    const catalog = new Map([['hci', course('hci', '人機互動')]]);
    expect(refreshItems([item('hci', 'async')], catalog)).toEqual([item('hci', 'sync')]);
  });
});
