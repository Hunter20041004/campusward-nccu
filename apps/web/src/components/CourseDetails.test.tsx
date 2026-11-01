import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rowToCourse } from '@campusward/engine';
import { expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { CourseDetails } from './CourseDetails.tsx';

const course = rowToCourse(officialRow(), { year: 115, semester: 1 }).course!;

test('checks one course with the official query and shows what changed', async () => {
  const fetchImpl = vi.fn(async () => Response.json([officialRow({ teaNam: '李合成', subTime: '五D56' })]));
  render(<CourseDetails course={course} id="d" fetchImpl={fetchImpl} />);
  await userEvent.setup().click(screen.getByRole('button', { name: '向官方確認最新資料' }));
  expect(await screen.findByText('學校已更新這門課（以學校為準）：')).toBeInTheDocument();
  expect(screen.getByText('教師：王合成 → 李合成')).toBeInTheDocument();
  expect(screen.getByText('上課時間：四D56 → 五D56')).toBeInTheDocument();
  expect(decodeURIComponent(String((fetchImpl.mock.calls[0] as unknown as [URL])[0]))).toBe('https://es.nccu.edu.tw/course/zh-TW/:sem=1151 900123001 /');
});

test('says when the snapshot is current', async () => {
  render(<CourseDetails course={course} id="d" fetchImpl={async () => Response.json([officialRow()])} />);
  await userEvent.setup().click(screen.getByRole('button', { name: '向官方確認最新資料' }));
  expect(await screen.findByText('和政大課程查詢目前的資料相同。')).toBeInTheDocument();
});

test('links to a Dcard and a Google search for reviews, built from the title and teacher, in a new tab', () => {
  render(<CourseDetails course={course} id="d" />);
  const dcard = screen.getByRole('link', { name: /在 Dcard 搜尋心得/ });
  const google = screen.getByRole('link', { name: /Google 搜尋/ });
  for (const link of [dcard, google]) {
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  const dcardUrl = new URL(dcard.getAttribute('href')!);
  expect(dcardUrl.origin).toBe('https://www.dcard.tw');
  expect(dcardUrl.searchParams.get('query')).toBe('合成課程概論 王合成');
  const googleUrl = new URL(google.getAttribute('href')!);
  expect(googleUrl.origin).toBe('https://www.google.com');
  expect(googleUrl.searchParams.get('q')).toBe('政大 合成課程概論 王合成 心得');
});

test('can list the basics (teacher, code, credits, time) for the timetable panel', () => {
  render(<CourseDetails course={course} id="d" withBasics />);
  const details = screen.getByRole('region', { name: '合成課程概論 詳細資料' });
  for (const text of ['王合成', '900123001', '3 學分', '週四 D56（13:10–16:00）']) expect(details).toHaveTextContent(text);
});
