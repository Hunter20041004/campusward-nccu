import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addCourse, parseEnrollmentRules, rowToCourse, toScheduleCourse, type Course, type FillContext, type ScheduleEntry, type StudentRecord } from '@campusward/engine';
import enrollmentRules from '../../../../data/rules/enrollment-11407.json' with { type: 'json' };
import { within } from '@testing-library/react';
import { useState } from 'react';
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

// 全人系統資料由 App 保管（2026-11-01 起共用）；測試用一個會記住匯入結果的外殼。
function Harness(props: Omit<GraduationPanelProps, 'record' | 'onRecord'>) {
  const [record, setRecord] = useState<StudentRecord | null>(null);
  return <GraduationPanel {...props} record={record} onRecord={setRecord} />;
}

function setup(overrides: Partial<Omit<GraduationPanelProps, 'record' | 'onRecord'>> = {}) {
  const props: Omit<GraduationPanelProps, 'record' | 'onRecord'> = {
    courses: [missingOffering, other],
    candidateKeys: new Set(),
    scheduledKeys: new Set(),
    profile: {},
    credits: 9,
    onCandidate: vi.fn(),
    onProfile: vi.fn(),
    ...overrides,
  };
  render(<Harness {...props} />);
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

  // 易用性審查第 6 名（使用者核可）：身分改由 App 在匯入時自動帶入、提示列可復原，這裡不再要學生按「套用」。
  test('no longer asks the student to confirm the identity from the export', async () => {
    const props = setup();
    await upload();
    await screen.findByText(/學校審查資料日期/);
    expect(screen.queryByRole('button', { name: '套用到我的條件' })).toBeNull();
    expect(props.onProfile).not.toHaveBeenCalled();
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

// 易用性審查第 6 名（2026-11-01，使用者核可）：每一列缺口都能直接排一門進課表，或一次全部補上；全部在本機挑。
describe('putting a course into the timetable for each gap', () => {
  const pe = courseOf({ subNum: '002008001', subNam: '體育－羽球初級', subGde: '體育', subPoint: '1.0', subTime: '三78' });
  const generalCourse = courseOf({ subNum: '041001001', subNam: '哲學與人生', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '一234' });
  const clashing = courseOf({ subNum: '041002001', subNam: '藝術欣賞', subGde: '通識', subKind: '', lmtKind: '人文通識', subTime: '一234' });
  const all = [missingOffering, other, pe, generalCourse, clashing];
  // 合成匯出檔沒有通識缺口：補一個「一般通識欠 3 學分」。
  const generalText = exportText.replace('"liberalGeneral":""', '"liberalGeneral":"[一般通識欠3學分]"');
  const entryOf = (course: Course): ScheduleEntry => {
    const scheduled = toScheduleCourse(course);
    return { course: scheduled, item: addCourse([], scheduled)[0]! };
  };
  const fill = (entries: ScheduleEntry[] = []): FillContext => ({
    entries,
    catalog: all.map(toScheduleCourse),
    profile: { level: 'undergrad', year: 4 },
    preferences: { freeDays: [], noEarly: false },
    rules: parseEnrollmentRules(enrollmentRules),
    maximumCredits: 25,
  });

  test('each row — required, PE, general education — gets 排一門進去', async () => {
    const onAddGapCourses = vi.fn();
    setup({ courses: all, fill: fill(), onAddGapCourses });
    const user = await upload(generalText);
    await user.click(await screen.findByRole('button', { name: /^排一門進去（.*）：體育缺口$/ }));
    expect(onAddGapCourses).toHaveBeenLastCalledWith([toScheduleCourse(pe).key], '已補缺口：排入「體育－羽球初級」');
    await user.click(screen.getByRole('button', { name: /^排一門進去（.*）：一般通識缺口$/ }));
    expect(onAddGapCourses).toHaveBeenLastCalledWith([toScheduleCourse(generalCourse).key], '已補缺口：排入「哲學與人生」');
    await user.click(screen.getByRole('button', { name: /^排一門進去（.*）：合成必修甲缺口$/ }));
    expect(onAddGapCourses).toHaveBeenLastCalledWith([toScheduleCourse(missingOffering).key], '已補缺口：排入「合成必修甲」');
  });

  test('「全部補上」 fills every gap it can in one change, without picking two clashing courses', async () => {
    const onAddGapCourses = vi.fn();
    setup({ courses: all, fill: fill(), onAddGapCourses });
    const user = await upload(generalText);
    await user.click(await screen.findByRole('button', { name: /全部補上/ }));
    expect(onAddGapCourses).toHaveBeenCalledTimes(1);
    const [keys, label] = onAddGapCourses.mock.calls[0]!;
    expect(new Set(keys)).toEqual(new Set([missingOffering, pe, generalCourse].map((course) => toScheduleCourse(course).key)));
    expect(label).toBe('已補缺口：排入 3 門');
  });

  test('a gap already covered by the timetable is marked 補缺口; one that cannot fit says why', async () => {
    const entries = [entryOf(generalCourse), entryOf(courseOf({ subNum: '900999001', subNam: '佔住週三晚上', subTime: '三78' }))];
    setup({ courses: all, fill: fill(entries), onAddGapCourses: vi.fn() });
    await upload(generalText);
    const general = (await screen.findByText(/一般通識欠 3 學分/)).closest('li')!;
    expect(general).toHaveTextContent('已排入「哲學與人生」');
    expect(within(general).getByText('補缺口')).toBeInTheDocument();
    const physical = screen.getByText(/體育欠 1 門/).closest('li')!;
    expect(physical).toHaveTextContent('每一門都衝堂');
    expect(physical).toHaveTextContent('體育－羽球初級');
    expect(within(physical).queryByRole('button', { name: /排一門進去/ })).toBeNull();
  });
});
