import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addCourse, rowToCourse, toScheduleCourse, type ScheduleCourse, type ScheduleEntry } from '@campusward/engine';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { ResultMarker, type ResultMarkerProps } from './ResultMarker.tsx';

const make = (code: string, overrides: Record<string, unknown> = {}): ScheduleCourse =>
  toScheduleCourse(rowToCourse(officialRow({ subNum: code, ...overrides }), { year: 115, semester: 1 }).course!);
const entry = (course: ScheduleCourse, status: 'planned' | 'registered' = 'planned'): ScheduleEntry => ({ course, item: { ...addCourse([], course)[0]!, status } });

// 全部虛構。
const math = make('703007001', { subNam: '離散數學', subTime: '二234' });
const philosophy = make('041001001', { subNam: '哲學與人生', subTime: '一234', lmtKind: '人文通識' });
const philosophyB = make('041001011', { subNam: '哲學與人生', subTime: '三34', lmtKind: '人文通識', teaNam: '李範例' });
const ethics = make('041003001', { subNam: '倫理學', subTime: '一34', lmtKind: '人文通識' });
const required = make('703008001', { subNam: '資料結構', subTime: '四234' });
const catalog = new Map([math, philosophy, philosophyB, ethics, required].map((course) => [course.key, course]));

/** 模擬 App：確定後把沒選上的移出、選上的標成已選上；替補就加進課表。 */
function Harness(props: Partial<ResultMarkerProps> & { onConfirmSpy?: (kept: string[], lost: string[]) => void; onReplaceSpy?: (lost: string, key: string) => void }) {
  const [entries, setEntries] = useState<ScheduleEntry[]>([entry(math), entry(philosophy), entry(required, 'registered')]);
  return (
    <ResultMarker
      entries={entries}
      catalog={catalog}
      replacementsFor={(key) => (key === philosophy.key ? { sections: [philosophyB], sameSlot: [ethics] } : { sections: [], sameSlot: [] })}
      onConfirm={(kept, lost) => {
        props.onConfirmSpy?.(kept, lost);
        setEntries((previous) => previous.filter(({ course }) => !lost.includes(course.key)).map((value) => (kept.includes(value.course.key) && value.item.status === 'planned' ? { ...value, item: { ...value.item, status: 'enrolled', locked: true } } : value)));
      }}
      onReplace={(lost, key) => {
        props.onReplaceSpy?.(lost, key);
        setEntries((previous) => [...previous, entry(catalog.get(key)!)]);
      }}
      onFindSlot={props.onFindSlot ?? vi.fn()}
      remainingUrl={() => 'https://selectcourse.nccu.edu.tw/remain/'}
    />
  );
}

// 易用性審查第 10 名：初選結果一次標記，沒選上的課直接給替補，點一下就換。
describe('marking the selection results', () => {
  test('one screen, everything ticked as 已選上 by default; untick the lost ones and confirm', async () => {
    const user = userEvent.setup();
    const onConfirmSpy = vi.fn();
    render(<Harness onConfirmSpy={onConfirmSpy} />);
    await user.click(screen.getByRole('button', { name: '標記選課結果' }));
    const form = screen.getByRole('group', { name: '選上的課' });
    const boxes = within(form).getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    boxes.forEach((box) => expect(box).toBeChecked());
    expect(within(form).getByRole('checkbox', { name: /資料結構/ }).closest('li')).toHaveTextContent('已灌檔');
    await user.click(within(form).getByRole('checkbox', { name: /哲學與人生/ }));
    await user.click(screen.getByRole('button', { name: '確定：選上 2 門、沒選上 1 門' }));
    expect(onConfirmSpy).toHaveBeenCalledWith([math.key, required.key], [philosophy.key]);
  });

  test('each lost course offers other sections and same-slot courses, one click each, with the official seat link', async () => {
    const user = userEvent.setup();
    const onReplaceSpy = vi.fn();
    const onFindSlot = vi.fn();
    render(<Harness onReplaceSpy={onReplaceSpy} onFindSlot={onFindSlot} />);
    await user.click(screen.getByRole('button', { name: '標記選課結果' }));
    await user.click(screen.getByRole('checkbox', { name: /哲學與人生/ }));
    await user.click(screen.getByRole('button', { name: /^確定/ }));
    const lost = screen.getByRole('region', { name: '沒選上「哲學與人生」的替補' });
    expect(within(lost).getByRole('button', { name: /^換這班：李範例 週三 34/ })).toBeInTheDocument();
    expect(within(lost).getAllByRole('link', { name: /即時餘額/ }).length).toBeGreaterThan(0);
    await user.click(within(lost).getByRole('button', { name: /^找這段時間的課/ }));
    expect(onFindSlot).toHaveBeenCalledWith(philosophy.key);
    await user.click(within(lost).getByRole('button', { name: /^改選這門：倫理學/ }));
    expect(onReplaceSpy).toHaveBeenCalledWith(philosophy.key, ethics.key);
    expect(screen.getByRole('region', { name: '沒選上「哲學與人生」的替補' })).toHaveTextContent('已補上「倫理學」');
    expect(within(screen.getByRole('region', { name: '沒選上「哲學與人生」的替補' })).queryByRole('button', { name: /^換這班/ })).toBeNull();
  });

  test('without lost courses it just confirms; the button only shows with courses on the timetable', async () => {
    const user = userEvent.setup();
    const onConfirmSpy = vi.fn();
    render(<Harness onConfirmSpy={onConfirmSpy} />);
    await user.click(screen.getByRole('button', { name: '標記選課結果' }));
    await user.click(screen.getByRole('button', { name: '確定：選上 3 門' }));
    expect(onConfirmSpy).toHaveBeenCalledWith([math.key, philosophy.key, required.key], []);
    expect(screen.getByRole('status')).toHaveTextContent('3 門都標成選上');
    render(<ResultMarker entries={[]} catalog={catalog} replacementsFor={() => ({ sections: [], sameSlot: [] })} onConfirm={vi.fn()} onReplace={vi.fn()} onFindSlot={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: '標記選課結果' })).toHaveLength(1);
  });
});

test('tells the page when it opens and closes, so the 小山 bubble can step aside', async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  render(<ResultMarker entries={[entry(math)]} catalog={catalog} replacementsFor={() => ({ sections: [], sameSlot: [] })} onConfirm={vi.fn()} onReplace={vi.fn()} onFindSlot={vi.fn()} onOpenChange={onOpenChange} />);
  await user.click(screen.getByRole('button', { name: '標記選課結果' }));
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole('button', { name: '收起標記選課結果' }));
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});
