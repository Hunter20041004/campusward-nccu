import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rowToCourse, type Course } from '@campusward/engine';
import { expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { CareerSection } from './CareerSection.tsx';

const courses: Course[] = [rowToCourse(officialRow({ subNum: '900001001', subNam: '統計學' }), { year: 115, semester: 1 }).course!];

test('shows skills with this term’s courses, labelled as not checked online, and only adds candidates on click', async () => {
  const generate = vi.fn(async () => JSON.stringify({ summary: '需要統計。', skills: [{ name: '統計分析', keywords: ['統計'], why: '看懂資料' }] }));
  const onAddCandidates = vi.fn();
  render(<CareerSection client={{ generate }} termLabel="115-1" courses={courses} candidateKeys={new Set()} onAddCandidates={onAddCandidates} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('想走的職涯方向'), '資料分析師');
  await user.click(screen.getByRole('button', { name: '找相關的課' }));
  expect(await screen.findByText(/未上網查證/)).toBeInTheDocument();
  expect(screen.getByText('統計分析')).toBeInTheDocument();
  expect(onAddCandidates).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '把 統計學（900001001）放進候選' }));
  expect(onAddCandidates).toHaveBeenCalledWith([{ type: 'addCandidate', key: '1151:900001001' }], '已放進候選「統計學」');
});
