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
    await user.click(screen.getByRole('button', { name: '多條件搜尋' }));
    await user.click(screen.getByRole('button', { name: '週五' }));
    expect(screen.getByRole('button', { name: '週五' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent)).toEqual(['統計專題']);
  });

  test('filters by time of day', async () => {
    const user = userEvent.setup();
    setup('統計');
    await user.click(screen.getByRole('button', { name: '多條件搜尋' }));
    await user.click(screen.getByRole('button', { name: '晚上' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  test('filters by general education category without a keyword', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: '多條件搜尋' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '通識類別' }), '外文通識');
    expect(screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent)).toEqual(['英文（一）']);
  });

  test('shows 25 results per page and pages through the rest', async () => {
    const user = userEvent.setup();
    setup('合成選修');
    expect(screen.getAllByRole('article')).toHaveLength(25);
    expect(screen.getByText('1–25 / 60')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一頁' }));
    await user.click(screen.getByRole('button', { name: '下一頁' }));
    expect(screen.getAllByRole('article')).toHaveLength(10);
    expect(screen.getByText('51–60 / 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: '每頁筆數' }), '100');
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

test('marks courses the student already passed, according to the imported record', () => {
  setup('統計', { passedAs: (course: Course) => (course.title === '統計學' ? '統計學' : null) });
  const [first, second] = screen.getAllByRole('article');
  expect(within(first!).getByText('已修過')).toBeInTheDocument();
  expect(within(second!).queryByText('已修過')).not.toBeInTheDocument();
});

describe('finding the right section', () => {
  const sections = [
    make('900201001', { subNam: '個體經濟學', subGde: '經濟二甲經濟二乙', subTime: '一D56', note: '＠備註:經濟系、地政系學生優先。其餘學生第二階段加選。' }),
    make('900202001', { subNam: '經濟學', subGde: '經濟系', subKind: '必修', subTime: '二34', emiType: '是' }),
    make('900203001', { subNam: '計量經濟', subGde: '經濟碩一', subKind: '選修', subTime: '三12', gdeType: '碩士班' }),
    make('900204001', { subNam: '線性代數', subGde: '應數一', subTime: '四B12' }),
    make('900205001', { subNam: '人際溝通', subGde: '教務處通識教育中心', subKind: '', subTime: '五78', lmtKind: '社會通識' }),
    make('900206001', { subNam: '初級會計學（一）初級會計學（一）初級會計學（一）', subGde: '會計系', subTime: '五34', lmtKind: '自然通識' }),
  ];
  const titles = () => screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent);
  const panel = (query = '', extra: Partial<Parameters<typeof SearchPanel>[0]> = {}) => setup(query, { courses: sections, ...extra });
  const openFilters = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /多條件搜尋/ }));

  test('shows the offering group and the first restriction sentence under the title', () => {
    panel('個體經濟學');
    expect(screen.getByRole('article')).toHaveTextContent('經濟二・經濟系、地政系學生優先');
    expect(screen.getByRole('article')).not.toHaveTextContent('其餘學生');
  });

  test('says whose requirement it is instead of a bare 必修', () => {
    panel('經濟學');
    const [item] = screen.getAllByRole('article');
    expect(item).toHaveTextContent('經濟系 必修');
  });

  test('shows clock times next to the NCCU periods', () => {
    panel('個體經濟學');
    expect(screen.getByRole('article')).toHaveTextContent('週一 D56（13:10–16:00）');
  });

  test('does not cut long titles and keeps the full name as a tooltip', () => {
    panel('初級會計學');
    const heading = within(screen.getByRole('article')).getByRole('heading');
    expect(heading).not.toHaveClass('truncate');
    expect(heading).toHaveAttribute('title', '初級會計學（一）初級會計學（一）初級會計學（一）');
  });

  test('keywords also match the offering group, general education and tags', () => {
    panel('經濟系');
    expect(titles()).toEqual(['個體經濟學', '經濟學', '計量經濟']);
  });

  test('filters by department and grade', async () => {
    const user = userEvent.setup();
    panel();
    await openFilters(user);
    await user.selectOptions(screen.getByRole('combobox', { name: '開課系所' }), '經濟');
    expect(titles()).toEqual(['個體經濟學', '經濟學', '計量經濟']);
    await user.selectOptions(screen.getByRole('combobox', { name: '年級' }), '碩一');
    expect(titles()).toEqual(['計量經濟']);
  });

  test('offers 所有通識 in the general education selector', async () => {
    const user = userEvent.setup();
    panel();
    await openFilters(user);
    await user.selectOptions(screen.getByRole('combobox', { name: '通識類別' }), '所有通識');
    expect(titles()).toEqual(['人際溝通', '初級會計學（一）初級會計學（一）初級會計學（一）']);
  });

  test('filters by degree level, defaulting to the student\'s level', async () => {
    const user = userEvent.setup();
    panel('經濟', { defaultDegree: 'undergrad' });
    expect(titles()).toEqual(['個體經濟學', '經濟學']);
    await openFilters(user);
    await user.selectOptions(screen.getByRole('combobox', { name: '學制' }), '全部');
    expect(titles()).toEqual(['個體經濟學', '經濟學', '計量經濟']);
  });

  test('switches for English-taught courses and no early classes', async () => {
    const user = userEvent.setup();
    panel();
    await openFilters(user);
    await user.click(screen.getByRole('button', { name: '英語授課' }));
    expect(titles()).toEqual(['經濟學']);
    await user.click(screen.getByRole('button', { name: '英語授課' }));
    await user.click(screen.getByRole('button', { name: '週四' }));
    expect(titles()).toEqual(['線性代數']);
    await user.click(screen.getByRole('button', { name: /排除早八/ }));
    expect(screen.getByRole('button', { name: /排除早八/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  test('marks and can hide courses that clash with the timetable', async () => {
    const user = userEvent.setup();
    panel('經濟', { clashesOf: (course: Course) => (course.code === '900201001' ? ['臺灣政治'] : []) });
    const [clashing, fine] = screen.getAllByRole('article');
    expect(clashing).toHaveTextContent('與「臺灣政治」衝堂');
    expect(clashing).toHaveAttribute('data-clash', 'true');
    expect(fine).not.toHaveTextContent('衝堂');
    await openFilters(user);
    await user.click(screen.getByRole('button', { name: '隱藏會衝堂的課' }));
    expect(titles()).toEqual(['經濟學', '計量經濟']);
  });

  test('puts a requested timetable slot into the filters', () => {
    panel('', { slot: { day: 1, period: 'D', nonce: 1 } });
    expect(screen.getByRole('button', { name: '週一' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '清除節次：D 節' })).toBeInTheDocument();
    expect(titles()).toEqual(['個體經濟學']);
  });

  test('the heart reflects whether the course is already a candidate', () => {
    panel('經濟學', { candidateKeys: new Set(['1151:900202001']) });
    const heart = screen.getByRole('button', { name: '加入候選：經濟學' });
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    expect(heart).toHaveAttribute('title', '已在候選，再按一次移出');
  });
});
