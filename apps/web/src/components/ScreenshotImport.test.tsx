import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPlannerState, rowToCourse, type Course } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { ScreenshotImport } from './ScreenshotImport.tsx';

const courseOf = (code: string, title: string): Course => {
  const { course } = rowToCourse(officialRow({ subNum: code, subNam: title }), { year: 115, semester: 1 });
  if (!course) throw new Error('rejected');
  return course;
};
const courses = [courseOf('900001001', '統計學'), courseOf('900002001', '會計學')];
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });

function setup(reply: string | Error) {
  const generate = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const onAddCandidates = vi.fn();
  render(<ScreenshotImport client={{ generate }} termLabel="115-1" planner={createPlannerState()} courses={courses} onAddCandidates={onAddCandidates} />);
  return { generate, onAddCandidates, user: userEvent.setup() };
}

describe('ScreenshotImport', () => {
  test('recognizes courses, matches them to the snapshot and adds them as candidates', async () => {
    const { user, generate, onAddCandidates } = setup(JSON.stringify({ recognizedCourses: [{ courseCode: '900001001', title: '統計學', teacher: '王合成', credits: 3, scheduleText: '四D56', confidence: 0.9 }] }));
    await user.upload(screen.getByLabelText('選擇課表截圖'), png());
    expect(await screen.findByText('對到 1 門課')).toBeInTheDocument();
    const request = (generate.mock.calls[0] as unknown as [{ image: { mimeType: string; data: string } }])[0];
    expect(request.image).toEqual({ mimeType: 'image/png', data: 'iVBORw==' });
    await user.click(screen.getByRole('button', { name: '全部放進候選' }));
    expect(onAddCandidates).toHaveBeenCalledWith([{ type: 'addCandidate', key: '1151:900001001' }], '已從截圖放進 1 門候選');
  });

  test('refuses files that are not screenshots before sending anything', async () => {
    const { generate } = setup('{}');
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText('選擇課表截圖'), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('請選擇 PNG、JPEG 或 WebP 截圖。');
    expect(generate).not.toHaveBeenCalled();
  });

  test('explains a reply it cannot read', async () => {
    const { user } = setup('看不懂');
    await user.upload(screen.getByLabelText('選擇課表截圖'), png());
    expect(await screen.findByRole('alert')).toHaveTextContent('AI 回覆格式不正確。');
  });

  test('reminds the student to crop personal data first', () => {
    setup('{}');
    expect(screen.getByText(/送出前請先裁掉姓名、學號等個資/)).toBeInTheDocument();
  });
});
