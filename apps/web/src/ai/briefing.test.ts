import { describe, expect, test } from 'vitest';
import { buildBriefing } from './briefing.ts';

describe('buildBriefing', () => {
  test('starts an empty timetable with search suggestions', () => {
    const briefing = buildBriefing({ courses: 0, credits: 0, conflicts: [], warnings: 0, freeDays: [], unscheduledCandidates: 0 });
    expect(briefing.lines).toEqual(['課表還是空的。']);
    expect(briefing.suggestions).toEqual(['幫我找週三下午的通識', '幫我排一份 15 學分左右、不要早八的課表']);
  });

  test('summarises the plan and puts the most urgent thing first', () => {
    const briefing = buildBriefing({
      courses: 3, credits: 9, conflicts: [['統計學', '會計學']], warnings: 2, freeDays: [5], unscheduledCandidates: 2,
    });
    expect(briefing.lines).toEqual([
      '目前 3 門、9 學分。',
      '統計學和會計學衝堂。',
      '另有 2 則選課規則提醒。',
      '你希望週五空下來。',
      '候選清單還有 2 門沒排。',
    ]);
    expect(briefing.suggestions[0]).toBe('幫我解決統計學和會計學的衝堂');
    expect(briefing.mood).toBe('worried');
  });

  test('counts several conflicts without listing them all', () => {
    const briefing = buildBriefing({ courses: 4, credits: 12, conflicts: [['甲', '乙'], ['丙', '丁']], warnings: 0, freeDays: [], unscheduledCandidates: 0 });
    expect(briefing.lines[1]).toBe('有 2 組衝堂。');
    expect(briefing.suggestions[0]).toBe('幫我解決衝堂');
  });
});
