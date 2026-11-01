import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rowToCourse, type Course } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { buildSyllabusArtifacts, loadSyllabusIndex } from '../qa/syllabusIndex.ts';
import type { SyllabusSource } from '../qa/syllabusSource.ts';
import { QaSection } from './QaSection.tsx';

const line = (code: string, title: string, grading: string) => JSON.stringify({ code, title, description: '', objectives: '', grading, prerequisite: '', weekly: [], weeklyText: '', hash: 'c'.repeat(64) });
const built = buildSyllabusArtifacts([line('900001001', '統計學', '期中考 30%，期末考 40%'), line('900003001', '英文（一）', '小組期末報告 60%')].join('\n'));
const source: SyllabusSource = {
  terms: async () => ['1151'],
  loadIndex: async () => loadSyllabusIndex(built.index),
  loadCourse: async (_, code) => JSON.parse(built.courses.get(code)!),
};
const courses: Course[] = [rowToCourse(officialRow({ subNum: '900003001', subNam: '英文（一）' }), { year: 115, semester: 1 }).course!];

async function ask(question: string, props: Partial<Parameters<typeof QaSection>[0]> = {}) {
  const generate = vi.fn(async () => JSON.stringify({ answer: '英文（一）期末是小組報告。', citations: ['900003001'] }));
  render(<QaSection source={source} term="1151" courses={courses} client={{ generate }} aiReady={false} {...props} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('想問課程的什麼'), question);
  await user.click(screen.getByRole('button', { name: '查課綱' }));
  return generate;
}

describe('QaSection', () => {
  test('lists matching syllabus passages without a key and sends nothing', async () => {
    const generate = await ask('期末報告');
    const list = await screen.findByRole('list', { name: '找到的課綱段落' });
    expect(within(list).getByText('英文（一）')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /官方課綱/ })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/newdoc\.nccu\.edu\.tw\//));
    expect(generate).not.toHaveBeenCalled();
  });

  test('answers from the passages when AI is ready', async () => {
    const generate = await ask('期末報告', { aiReady: true });
    expect(await screen.findByText('英文（一）期末是小組報告。')).toBeInTheDocument();
    expect(screen.getByText(/根據：英文（一）/)).toBeInTheDocument();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('says when this term has no syllabus data', async () => {
    await ask('期末', { source: { ...source, terms: async () => [] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('這學期的課綱資料還沒整理好');
  });
});
