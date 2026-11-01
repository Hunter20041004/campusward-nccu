import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyData, exportTransfer, type ScheduleEntry, type StoredData } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { DataPanel, registrationCodes, type DataPanelProps } from './DataPanel.tsx';

const entry = (code: string, status: ScheduleEntry['item']['status'] = 'planned', manual = false): ScheduleEntry => {
  const key = manual ? `manual-${code}` : `1151:${code}`;
  return {
    course: { key, ...(manual ? {} : { code }), title: `課${code}`, credits: 3, itemType: 'course', meetings: [], events: [], eligibility: {}, delivery: { mode: 'in-person', asyncAllowed: false, defaultAttendance: 'sync' }, source: manual ? 'manual' : 'official' },
    item: { key, attendance: 'sync', status, locked: false },
  };
};
const entries = [entry('900002001'), entry('900001001', 'registered'), entry('1', 'planned', true), entry('900003001')];

function setup(overrides: Partial<DataPanelProps> = {}) {
  const props: DataPanelProps = {
    entries,
    data: createEmptyData(),
    term: '1151',
    onReplace: vi.fn(),
    onClear: vi.fn(),
    onWallpaper: vi.fn(),
    canRestoreImport: false,
    onRestoreImport: vi.fn(),
    planName: '主方案',
    limits: null,
    onBackToTimetable: vi.fn(),
    now: () => new Date('2026-10-28T08:00:00Z'),
    ...overrides,
  };
  render(<DataPanel {...props} />);
  return props;
}

test('lists course codes to register in timetable order, skipping registered and manual courses', () => {
  expect(registrationCodes(entries)).toEqual(['900002001', '900003001']);
});

describe('DataPanel', () => {
  test('copies the registration codes', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    setup();
    await user.click(screen.getByRole('button', { name: '複製課號清單' }));
    // 稽核 #9：先看預覽再複製（原本按下就直接複製）。
    await user.click(within(screen.getByRole('region', { name: /複製課號清單/ })).getByRole('button', { name: '複製 2 個課號' }));
    expect(writeText).toHaveBeenCalledWith('900002001\n900003001');
    expect(await screen.findByRole('status', { name: '資料操作結果' })).toHaveTextContent('已複製 2 個課號');
  });

  test('downloads the stored data without an API key', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:fake');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    setup();
    await user.click(screen.getByRole('button', { name: '匯出資料' }));
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(await blob.text()).toContain('"format": "campusward-export"');
  });

  test('previews an import before replacing data', async () => {
    const user = userEvent.setup();
    const props = setup();
    const imported: StoredData = { ...createEmptyData(), profile: { year: 2 } };
    const file = new File([exportTransfer(imported, '2026-10-28T00:00:00.000Z')], 'campusward.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('匯入資料'), file);
    const preview = await screen.findByRole('region', { name: '匯入預覽' });
    expect(preview).toHaveTextContent('會取代這台裝置上的課表與設定');
    expect(preview).toHaveTextContent('還原匯入前的資料');
    await user.click(within(preview).getByRole('button', { name: '確認匯入' }));
    expect(props.onReplace).toHaveBeenCalledWith(expect.objectContaining({ profile: { year: 2 } }));
  });

  test('explains why a file cannot be imported', async () => {
    const user = userEvent.setup();
    setup();
    await user.upload(screen.getByLabelText('匯入資料'), new File(['{bad'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('匯入檔不是有效的 JSON。');
  });

  test('asks before clearing local data', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: '清除本機資料' }));
    expect(props.onClear).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '確認清除' }));
    expect(props.onClear).toHaveBeenCalled();
  });

  test('links to the privacy page', () => {
    setup();
    expect(screen.getByRole('link', { name: '隱私說明' })).toHaveAttribute('href', '/privacy');
  });
});

// 獨立審查修正（2026-11-01，G2）
test('offers to restore the data from before an import', async () => {
  const user = userEvent.setup();
  const onRestoreImport = vi.fn();
  setup({ canRestoreImport: true, onRestoreImport });
  await user.click(screen.getByRole('button', { name: '還原匯入前的資料' }));
  expect(onRestoreImport).toHaveBeenCalled();
});

test('hides the restore button when there is nothing to restore', () => {
  setup();
  expect(screen.queryByRole('button', { name: '還原匯入前的資料' })).toBeNull();
});

// 稽核 #9（2026-11-01）：複製前先預覽方案、每門課與勾選；有衝堂或學分超出範圍先警告。
describe('copy preview', () => {
  const timed = (code: string, title: string, start: number, end: number): ScheduleEntry => {
    const base = entry(code);
    return { ...base, course: { ...base.course, title, meetings: [{ day: 1, start, end, label: '' }] } };
  };

  test('shows the plan name and each row with code, title, time and credits; registered rows start unticked', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: '複製課號清單' }));
    const dialog = screen.getByRole('region', { name: '複製課號清單：主方案' });
    const rows = within(dialog).getAllByRole('checkbox');
    expect(rows.map((box) => box.closest('label')?.textContent)).toEqual([
      '900002001・課900002001・時間未定・3 學分',
      '900001001・課900001001・時間未定・3 學分已灌檔',
      '900003001・課900003001・時間未定・3 學分',
    ]);
    expect(rows.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false, true]);
    expect(dialog).toHaveTextContent('1 門手動加入的課沒有課號，不會複製');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  test('copies only the ticked rows', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    setup();
    await user.click(screen.getByRole('button', { name: '複製課號清單' }));
    const dialog = screen.getByRole('region', { name: /複製課號清單/ });
    await user.click(within(dialog).getByRole('checkbox', { name: /^900002001/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /^900001001/ }));
    await user.click(within(dialog).getByRole('button', { name: '複製 2 個課號' }));
    expect(writeText).toHaveBeenLastCalledWith('900001001\n900003001');
    expect(screen.queryByRole('region', { name: /複製課號清單/ })).toBeNull();
    expect(screen.getByRole('status', { name: '資料操作結果' })).toHaveTextContent('已複製 2 個課號（主方案）');
  });

  test('cannot copy when nothing is ticked', async () => {
    const user = userEvent.setup();
    setup({ entries: [entry('900002001')] });
    await user.click(screen.getByRole('button', { name: '複製課號清單' }));
    const dialog = screen.getByRole('region', { name: /複製課號清單/ });
    await user.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('button', { name: '複製 0 個課號' })).toBeDisabled();
  });

  test('warns about clashes first, and can go back to the timetable without copying', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    writeText.mockClear();
    const props = setup({ entries: [timed('042112001', '臺灣政治', 960, 1140), timed('000603001', '民法概要', 960, 1080)] });
    await user.click(screen.getByRole('button', { name: '複製課號清單' }));
    const dialog = screen.getByRole('region', { name: /複製課號清單/ });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('「臺灣政治」與「民法概要」衝堂');
    await user.click(within(dialog).getByRole('button', { name: '回課表處理' }));
    expect(props.onBackToTimetable).toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: /複製課號清單/ })).toBeNull();
  });

  test('can still copy after a clash warning', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    setup({ entries: [timed('042112001', '臺灣政治', 960, 1140), timed('000603001', '民法概要', 960, 1080)] });
    await user.click(screen.getByRole('button', { name: '複製課號清單' }));
    await user.click(within(screen.getByRole('region', { name: /複製課號清單/ })).getByRole('button', { name: '仍要複製' }));
    expect(writeText).toHaveBeenLastCalledWith('042112001\n000603001');
  });

  test('warns when the credits are outside the limits', async () => {
    const user = userEvent.setup();
    setup({ limits: { minimum: 15, maximum: 25 } });
    await user.click(screen.getByRole('button', { name: '複製課號清單' }));
    expect(within(screen.getByRole('region', { name: /複製課號清單/ })).getByRole('alert')).toHaveTextContent('共 12 學分，低於學分下限 15 學分');
  });

  test('moves focus to the preview, closes with 取消 or Escape, and returns focus to the copy button', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole('button', { name: '複製課號清單' });
    await user.click(trigger);
    expect(screen.getByRole('region', { name: /複製課號清單/ })).toContainElement(document.activeElement as HTMLElement);
    await user.click(within(screen.getByRole('region', { name: /複製課號清單/ })).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('region', { name: /複製課號清單/ })).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: /複製課號清單/ })).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

test('the copy preview closes when the student leaves the data page, so it never copies an outdated list', async () => {
  const props = { entries, data: createEmptyData(), term: '1151', onReplace: vi.fn(), onClear: vi.fn(), onWallpaper: vi.fn(), canRestoreImport: false, onRestoreImport: vi.fn(), planName: '主方案', limits: null, onBackToTimetable: vi.fn(), now: () => new Date('2026-10-28T08:00:00Z') };
  const { rerender } = render(<DataPanel {...props} visible />);
  await userEvent.setup().click(screen.getByRole('button', { name: '複製課號清單' }));
  expect(screen.getByRole('region', { name: /複製課號清單/ })).toBeInTheDocument();
  rerender(<DataPanel {...props} visible={false} />);
  expect(screen.queryByRole('region', { name: /複製課號清單/ })).not.toBeInTheDocument();
});
