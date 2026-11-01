import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rowToCourse, toScheduleCourse, type Course } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import exportJson from '../../../../packages/engine/test/fixtures/synthetic/student-export.json' with { type: 'json' };
import { GraduationPanel, type GraduationPanelProps } from './GraduationPanel.tsx';

const exportText = JSON.stringify(exportJson);
const courseOf = (overrides: Record<string, unknown>): Course => {
  const { course } = rowToCourse(officialRow({ teaNam: '李老師', ...overrides }), { year: 115, semester: 1 });
  if (!course) throw new Error('synthetic row rejected');
  return course;
};
const missingOffering = courseOf({ subNum: '900777001', subNam: '合成必修甲' });
const other = courseOf({ subNum: '900888001', subNam: '其他課' });

function setup(overrides: Partial<GraduationPanelProps> = {}) {
  const props: GraduationPanelProps = {
    courses: [missingOffering, other],
    entries: [],
    candidateKeys: new Set(),
    scheduledKeys: new Set(),
    profile: {},
    credits: 9,
    onCandidate: vi.fn(),
    onProfile: vi.fn(),
    ...overrides,
  };
  render(<GraduationPanel {...props} />);
  return props;
}
const upload = async (text = exportText) => {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('上傳全人系統匯出檔'), new File([text], 'exportStudentData.json', { type: 'application/json' }));
  return user;
};

describe('GraduationPanel', () => {
  test('shows the school audit gaps and credits from the export', async () => {
    setup();
    await upload();
    expect(await screen.findByText(/學校審查資料日期 2026-10-26/)).toBeInTheDocument();
    expect(screen.getByText(/本學期正在修的課、抵免與交換課程尚未計入/)).toBeInTheDocument();
    expect(screen.getByText('畢業學分').nextElementSibling).toHaveTextContent('128');
    expect(screen.getByText('本方案').nextElementSibling).toHaveTextContent('9');
    expect(screen.getByText(/體育欠 1 門/)).toBeInTheDocument();
    expect(screen.getByText('合成必修甲', { selector: 'p' })).toBeInTheDocument();
  });

  test('puts a missing required course offered this term into the candidates', async () => {
    const props = setup();
    const user = await upload();
    await user.click(await screen.findByRole('button', { name: '把 合成必修甲（900777001）放進候選' }));
    expect(props.onCandidate).toHaveBeenCalledWith(missingOffering);
    expect(screen.getByText('本學期沒有同名開課。')).toBeInTheDocument();
  });

  test('marks offerings already in the candidates', async () => {
    setup({ candidateKeys: new Set([toScheduleCourse(missingOffering).key]) });
    await upload();
    expect(await screen.findByText('已在候選')).toBeInTheDocument();
  });

  test('applies the suggested identity only when the student confirms', async () => {
    const props = setup();
    const user = await upload();
    expect(await screen.findByText(/學士班四年級、沒有加修/)).toBeInTheDocument();
    expect(props.onProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '套用到我的條件' }));
    expect(props.onProfile).toHaveBeenCalledWith({ level: 'undergrad', year: 4, additionalMajor: 'none' });
  });

  test('never shows names, student numbers or scores from the export', async () => {
    setup();
    await upload();
    await screen.findByText(/學校審查資料日期/);
    expect(document.body.textContent).not.toMatch(/王合成|SYNTHETIC|臺生/);
  });

  test('explains a file that is not a student export', async () => {
    setup();
    await upload('{"hello":1}');
    expect(await screen.findByRole('alert')).toHaveTextContent('這不是全人系統匯出的修課資料檔。');
  });

  test('clears the imported record', async () => {
    setup();
    const user = await upload();
    await user.click(await screen.findByRole('button', { name: '清除修課資料' }));
    expect(screen.queryByText(/學校審查資料日期/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('已清除匯入的修課資料。');
  });

  test('finds offerings for a course typed in by hand without an export', async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('要補的課名'), '合成必修甲');
    await user.click(screen.getByRole('button', { name: '找本學期開課' }));
    expect(screen.getByRole('button', { name: '把 合成必修甲（900777001）放進候選' })).toBeInTheDocument();
  });
});
