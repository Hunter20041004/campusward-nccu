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
