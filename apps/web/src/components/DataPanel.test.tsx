import { render, screen, within } from '@testing-library/react';
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
