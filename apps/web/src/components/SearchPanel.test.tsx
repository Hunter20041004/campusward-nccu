import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rowToCourse, type Course } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { SearchPanel } from './SearchPanel.tsx';

const make = (code: string, overrides: Record<string, unknown> = {}): Course =>
  rowToCourse(officialRow({ subNum: code, ...overrides }), { year: 115, semester: 1 }).course!;

const courses = [
  make('900001001', { subNam: '統計學', teaNam: '王合成', subTime: '一234' }),
  make('900002001', { subNam: '英文（一）', teaNam: '林範例', subTime: '二D56', lmtKind: '外文通識', emiType: '是' }),
  make('900003001', { subNam: '統計專題', teaNam: '陳虛構', subTime: '五EF', pay: '收費', gdeType: '碩士班', note: '＠備註:限本系學生' }),
  ...Array.from({ length: 60 }, (_, index) => make(`9100${String(index).padStart(2, '0')}001`, { subNam: `合成選修${index}`, subTime: '三78' })),
];

function setup(query = '', extra: Partial<Parameters<typeof SearchPanel>[0]> = {}) {
  const props = {
    courses,
    query,
    scheduledKeys: new Set<string>(),
    candidateKeys: new Set<string>(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onCandidate: vi.fn(),
    ...extra,
  };
  render(<SearchPanel {...props} />);
  return props;
}

describe('SearchPanel', () => {
  test('asks for a query before showing the whole catalog', () => {
    setup();
    expect(screen.getByText(/輸入課名、教師或課號/)).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  test('finds courses by title or teacher and reports the count', () => {
    setup('統計');
    expect(screen.getByText('找到 2 門')).toBeInTheDocument();
    expect(screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent)).toEqual(['統計學', '統計專題']);
  });

  test('shows the official time, code, teacher and credits', () => {
    setup('統計學');
    const item = screen.getByRole('article');
    expect(item).toHaveTextContent('900001001');
    expect(item).toHaveTextContent('王合成');
    expect(item).toHaveTextContent('週一 234');
    expect(item).toHaveTextContent('3 學分');
  });

  test('labels English-taught, general education, fee and graduate courses', () => {
    setup('英文');
    expect(screen.getByRole('article')).toHaveTextContent('外文通識');
    expect(screen.getByRole('article')).toHaveTextContent('英語授課');
    setup('統計專題');
    const item = screen.getAllByRole('article').at(-1)!;
    expect(item).toHaveTextContent('收費');
    expect(item).toHaveTextContent('碩士班');
  });

  test('filters by weekday', async () => {
    const user = userEvent.setup();
    setup('統計');
    await user.click(screen.getByRole('button', { name: '週五' }));
    expect(screen.getByRole('button', { name: '週五' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent)).toEqual(['統計專題']);
  });

  test('filters by time of day', async () => {
    const user = userEvent.setup();
    setup('統計');
    await user.click(screen.getByRole('button', { name: '晚上' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  test('filters by general education category without a keyword', async () => {
    const user = userEvent.setup();
    setup();
    await user.selectOptions(screen.getByRole('combobox', { name: '通識類別' }), '外文通識');
    expect(screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent)).toEqual(['英文（一）']);
  });

  test('shows 50 results first and more on request', async () => {
    const user = userEvent.setup();
    setup('合成選修');
    expect(screen.getAllByRole('article')).toHaveLength(50);
    await user.click(screen.getByRole('button', { name: '再顯示 10 門' }));
    expect(screen.getAllByRole('article')).toHaveLength(60);
  });

  test('suggests loosening filters when nothing matches', () => {
    setup('不存在的課');
    expect(screen.getByText('沒有符合的課。試試別的關鍵字，或放寬星期與時段。')).toBeInTheDocument();
  });

  test('adds a course to the timetable or the candidate list', async () => {
    const user = userEvent.setup();
    const props = setup('統計學');
    await user.click(screen.getByRole('button', { name: '加入課表：統計學' }));
    expect(props.onAdd).toHaveBeenCalledWith(courses[0]);
    await user.click(screen.getByRole('button', { name: '加入候選：統計學' }));
    expect(props.onCandidate).toHaveBeenCalledWith(courses[0]);
  });

  test('offers removal for a course already in the timetable', async () => {
    const user = userEvent.setup();
    const props = setup('統計學', { scheduledKeys: new Set(['1151:900001001']) });
    await user.click(screen.getByRole('button', { name: '移出課表：統計學' }));
    expect(props.onRemove).toHaveBeenCalledWith(courses[0]);
  });

  test('expands official details with safe links', async () => {
    const user = userEvent.setup();
    setup('統計專題');
    await user.click(screen.getByRole('button', { name: /統計專題/, expanded: false }));
    const details = screen.getByRole('region', { name: '統計專題 詳細資料' });
    expect(details).toHaveTextContent('限本系學生');
    expect(details).toHaveTextContent('綜合900101');
    const syllabus = within(details).getByRole('link', { name: /課綱/ });
    expect(syllabus).toHaveAttribute('target', '_blank');
    expect(syllabus).toHaveAttribute('rel', 'noopener noreferrer');
    expect(syllabus.getAttribute('href')).toMatch(/^https:\/\/newdoc\.nccu\.edu\.tw\//);
  });
});
