import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from './App.tsx';
import { createBuddyHub } from './buddy/hub.ts';

/** 各工具都保持掛載、只隱藏沒選的；取目前看得到的那一個。 */
const shown = <T extends HTMLElement>(elements: T[]) => elements.find((element) => !element.closest('[hidden]'))!;
import { fakeCatalog } from './test/fakeCatalog.ts';
import { officialRow } from '../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { memoryStorage } from './test/memoryStorage.ts';

describe('app shell', () => {
  test('names the product and says it is not an official NCCU service', () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    expect(screen.getByRole('banner')).toHaveTextContent('Campusward');
    expect(screen.getAllByText('非政大官方服務').length).toBeGreaterThan(0);
  });

  test('the timetable stays on the left as the main view; the rail switches the right panel between search and tools', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    const rail = screen.getByRole('navigation', { name: '工具' });
    const columns = () => [...document.querySelectorAll('main section h2')].map((heading) => heading.textContent);
    expect(columns()[0]).toMatch(/模擬課表/);
    expect(within(rail).getByRole('button', { name: '課程搜尋' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox', { name: '搜課' })).toBeInTheDocument();
    await user.click(within(rail).getByRole('button', { name: '條件' }));
    expect(within(rail).getByRole('button', { name: '條件' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 2, name: /條件/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /模擬課表/ })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: '搜課' })).not.toBeInTheDocument();
    await user.click(within(rail).getByRole('button', { name: '課程搜尋' }));
    expect(screen.getByRole('searchbox', { name: '搜課' })).toBeInTheDocument();
  });

  test('opens the AI orb from anywhere and keeps the timetable visible', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    const orb = screen.getByRole('button', { name: '小山' });
    expect(orb).toHaveAttribute('aria-expanded', 'false');
    await user.click(orb);
    expect(orb).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: '小山' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /模擬課表/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: '小山' })).not.toBeInTheDocument();
    expect(orb).toHaveFocus();
  });

  test('shows the usage guide on the first visit only, and reopens it from the help button', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App catalog={fakeCatalog()} storage={storage} />);
    expect(screen.getByRole('heading', { name: '搜課與多條件搜尋' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '略過教學' }));
    first.unmount();
    render(<App catalog={fakeCatalog()} storage={storage} />);
    expect(screen.queryByRole('heading', { name: '搜課與多條件搜尋' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用導覽' }));
    expect(screen.getByRole('heading', { name: '搜課與多條件搜尋' })).toBeInTheDocument();
  });

  test('offers two ways to start when the timetable is empty', () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    expect(screen.getByRole('button', { name: '從搜課開始' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '匯入舊站資料' })).toBeInTheDocument();
  });

  test('switches the visible section with the mobile tabs', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    const nav = screen.getByRole('navigation', { name: '主要分頁' });
    await user.click(within(nav).getByRole('button', { name: '搜課' }));
    expect(within(nav).getByRole('button', { name: '搜課' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-mobile-view="search"]')).toBeInTheDocument();
  });

  test('starting from search focuses the search box', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    await user.click(screen.getByRole('button', { name: '從搜課開始' }));
    expect(screen.getByRole('searchbox', { name: '搜課' })).toHaveFocus();
  });
});

describe('course data', () => {
  test('shows the latest semester that has data', async () => {
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    expect(await screen.findByText('115-1')).toBeInTheDocument();
  });

  test('explains when course data cannot be loaded', async () => {
    render(<App catalog={fakeCatalog({ listTerms: async () => { throw new Error('offline'); } })} storage={memoryStorage()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('課程資料暫時載入不了');
  });
});

describe('searching and adding', () => {
  test('adds a found course to the timetable, updates credits, and can undo', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '合成課程');
    await user.click(await screen.findByRole('button', { name: '加入課表：合成課程概論' }));
    expect(screen.getByText(/共/)).toHaveTextContent('共 3 學分');
    const toast = screen.getByRole('status', { name: '最近的修改' });
    expect(toast).toHaveTextContent('已加入「合成課程概論」');
    await user.click(within(toast).getByRole('button', { name: '復原' }));
    expect(screen.getByText(/共/)).toHaveTextContent('共 0 學分');
  });

  test('the buddy reacts to the common things: adding, undoing, opening and closing the orb', async () => {
    const user = userEvent.setup();
    const buddyHub = createBuddyHub({ storage: memoryStorage() });
    const changed = vi.spyOn(buddyHub, 'changed');
    const panel = vi.spyOn(buddyHub, 'setPanelOpen');
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} buddyHub={buddyHub} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '合成課程');
    await user.click(await screen.findByRole('button', { name: '加入課表：合成課程概論' }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith('add', { conflict: false }));
    await user.click(within(screen.getByRole('status', { name: '最近的修改' })).getByRole('button', { name: '復原' }));
    expect(changed).toHaveBeenCalledWith('undo');
    await user.click(screen.getByRole('button', { name: '小山' }));
    expect(panel).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    expect(panel).toHaveBeenLastCalledWith(false);
    buddyHub.destroy();
  });

  test('marks search results that clash with the timetable and says so after adding one', async () => {
    const user = userEvent.setup();
    const rows = [
      officialRow({ subNum: '042112001', subNam: '臺灣政治', subTime: '三78E' }),
      officialRow({ subNum: '000603001', subNam: '民法概要', subTime: '三78' }),
    ];
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    const search = screen.getByRole('searchbox', { name: '搜課' });
    await user.type(search, '臺灣政治');
    await user.click(await screen.findByRole('button', { name: '加入課表：臺灣政治' }));
    await user.clear(search);
    await user.type(search, '民法概要');
    expect(screen.getByRole('article')).toHaveTextContent('與「臺灣政治」衝堂');
    await user.click(screen.getByRole('button', { name: '加入課表：民法概要' }));
    expect(screen.getByRole('status', { name: '最近的修改' })).toHaveTextContent('已加入「民法概要」，與「臺灣政治」衝堂');
  });

  test('the heart toggles a course in and out of the candidate list', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '合成課程');
    const heart = await screen.findByRole('button', { name: '加入候選：合成課程概論' });
    expect(heart).toHaveAttribute('aria-pressed', 'false');
    await user.click(heart);
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status', { name: '最近的修改' })).toHaveTextContent('已放進候選「合成課程概論」');
    await user.click(heart);
    expect(heart).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status', { name: '最近的修改' })).toHaveTextContent('已移出候選「合成課程概論」');
  });

  test('removing a candidate that is in the timetable says it also leaves the timetable', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '合成課程');
    await user.click(await screen.findByRole('button', { name: '加入課表：合成課程概論' }));
    await user.click(within(screen.getByRole('navigation', { name: '工具' })).getByRole('button', { name: '候選' }));
    await user.click(screen.getByRole('button', { name: /移除.*合成課程概論/ }));
    expect(screen.getByRole('status', { name: '最近的修改' })).toHaveTextContent(/已移出候選「合成課程概論」，也從目前的課表「主方案」移出/);
    expect(screen.getByText(/共/)).toHaveTextContent('共 0 學分');
  });

  test('clicking an empty cell after a keyword search shows that slot instead of an empty result', async () => {
    const user = userEvent.setup();
    const rows = [
      officialRow({ subNum: '900001001', subNam: '統計學', subTime: '一234' }),
      officialRow({ subNum: '900002001', subNam: '週三下午課', subTime: '三D5' }),
    ];
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '統計學');
    await user.click(await screen.findByRole('button', { name: '加入課表：統計學' }));
    await user.click(screen.getByRole('button', { name: '找週三 D 節的課' }));
    expect(screen.getByRole('searchbox', { name: '搜課' })).toHaveValue('');
    expect(screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent)).toEqual(['週三下午課']);
  });

  test('after swapping to another section, focus lands on the new section\'s panel', async () => {
    const user = userEvent.setup();
    const rows = [
      officialRow({ subNum: '900001001', subNam: '統計學', teaNam: '陳合成', subTime: '一234' }),
      officialRow({ subNum: '900001011', subNam: '統計學', teaNam: '林合成', subTime: '二D56' }),
    ];
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '900001001');
    await user.click(await screen.findByRole('button', { name: '加入課表：統計學' }));
    await user.click(within(screen.getByRole('group', { name: '每週課表' })).getByRole('button', { name: /統計學/ }));
    await user.click(screen.getByRole('button', { name: /^換這班：林合成/ }));
    expect(screen.getByRole('group', { name: '統計學 的操作' })).toHaveTextContent('林合成');
    expect(document.activeElement).toHaveTextContent('統計學');
    expect(document.activeElement?.tagName).toBe('H3');
  });

  test('clicking an empty timetable cell searches that day and period and shows search', async () => {
    const user = userEvent.setup();
    const rows = [
      officialRow({ subNum: '900001001', subNam: '統計學', subTime: '一234' }),
      officialRow({ subNum: '900002001', subNam: '週三下午課', subTime: '三D5' }),
      officialRow({ subNum: '900003001', subNam: '週三早上課', subTime: '三12' }),
    ];
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '統計學');
    await user.click(await screen.findByRole('button', { name: '加入課表：統計學' }));
    await user.clear(screen.getByRole('searchbox', { name: '搜課' }));
    await user.click(screen.getByRole('button', { name: '找週三 D 節的課' }));
    expect(document.querySelector('[data-mobile-view="search"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '週三' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent)).toEqual(['週三下午課']);
  });

  test('keeps the timetable after a reload', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App catalog={fakeCatalog()} storage={storage} />);
    await screen.findByText('115-1');
    await user.type(screen.getByRole('searchbox', { name: '搜課' }), '合成課程');
    await user.click(await screen.findByRole('button', { name: '加入課表：合成課程概論' }));
    first.unmount();
    render(<App catalog={fakeCatalog()} storage={storage} />);
    await screen.findByText('115-1');
    expect(screen.getByText(/共/)).toHaveTextContent('共 3 學分');
  });
});

test('clearing local data also removes the Gemini key', async () => {
  const user = userEvent.setup();
  const ai = { hasKey: () => true, setKey: vi.fn(), removeKey: vi.fn(), generate: vi.fn() };
  render(<App catalog={fakeCatalog()} storage={memoryStorage()} ai={ai} guide={false} />);
  const rail = screen.getByRole('navigation', { name: '工具' });
  await screen.findByText('115-1');
  await user.click(within(rail).getByRole('button', { name: '匯出與資料' }));
  await user.click(await screen.findByRole('button', { name: '清除本機資料' }));
  await user.click(screen.getByRole('button', { name: '確認清除' }));
  expect(ai.removeKey).toHaveBeenCalled();
});

test('小山 stays where the student moved it after a reload, and clearing local data puts it back', async () => {
  const user = userEvent.setup();
  const storage = memoryStorage({ 'campusward:v1:buddy-position': '{"right":300,"bottom":200}' });
  const first = render(<App catalog={fakeCatalog()} storage={storage} guide={false} />);
  await screen.findByText('115-1');
  const orb = screen.getByRole('button', { name: '小山' });
  expect(orb.style.right).toBe('300px');
  fireEvent.keyDown(orb, { key: 'ArrowLeft', altKey: true });
  expect(storage.values['campusward:v1:buddy-position']).toBe('{"right":324,"bottom":200}');
  first.unmount();
  render(<App catalog={fakeCatalog()} storage={storage} guide={false} />);
  await screen.findByText('115-1');
  expect(screen.getByRole('button', { name: '小山' }).style.right).toBe('324px');
  await user.click(within(screen.getByRole('navigation', { name: '工具' })).getByRole('button', { name: '匯出與資料' }));
  await user.click(await screen.findByRole('button', { name: '清除本機資料' }));
  await user.click(screen.getByRole('button', { name: '確認清除' }));
  expect(storage.values['campusward:v1:buddy-position'] ?? '').toBe('');
  expect(screen.getByRole('button', { name: '小山' }).style.right).toBe('');
});

test('clearing local data resets the AI panel and the graduation gaps', async () => {
  const user = userEvent.setup();
  const { createGeminiClient } = await import('./ai/gemini.ts');
  const ai = createGeminiClient({ fetchImpl: vi.fn(), session: null });
  ai.setKey(`AIza${'x'.repeat(35)}`, false);
  render(<App catalog={fakeCatalog()} storage={memoryStorage()} ai={ai} guide={false} />);
  const exportJson = (await import('../../../packages/engine/test/fixtures/synthetic/student-export.json')).default;
  const rail = screen.getByRole('navigation', { name: '工具' });
  await screen.findByText('115-1');
  await user.click(within(rail).getByRole('button', { name: '畢業缺口' }));
  await user.upload(shown(screen.getAllByLabelText('上傳全人系統匯出檔')), new File([JSON.stringify(exportJson)], 'e.json', { type: 'application/json' }));
  expect(shown(await screen.findAllByText(/學校審查資料日期/))).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '小山' }));
  await user.click(screen.getByRole('button', { name: '設定 AI' }));
  await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
  expect(screen.getByRole('button', { name: '移除金鑰' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '關閉小山' }));
  await user.click(within(rail).getByRole('button', { name: '匯出與資料' }));
  await user.click(screen.getByRole('button', { name: '清除本機資料' }));
  await user.click(screen.getByRole('button', { name: '確認清除' }));
  await user.click(within(rail).getByRole('button', { name: '畢業缺口' }));
  expect(screen.queryByText(/學校審查資料日期/)).not.toBeInTheDocument();
  expect(screen.queryByText(/已通過 \d+ 門/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '小山' }));
  expect(screen.queryByRole('button', { name: '移除金鑰' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '設定 AI' }));
  expect(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ })).not.toBeChecked();
});

test('keeps the AI orb state after closing and reopening it', async () => {
  const user = userEvent.setup();
  render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
  const rail = screen.getByRole('navigation', { name: '工具' });
  await user.click(screen.getByRole('button', { name: '小山' }));
  await user.click(screen.getByRole('button', { name: '設定 AI' }));
  await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
  await user.click(screen.getByRole('button', { name: '關閉小山' }));
  await user.click(within(rail).getByRole('button', { name: '條件' }));
  await user.click(screen.getByRole('button', { name: '小山' }));
  expect(screen.getByLabelText('Gemini 金鑰')).toBeInTheDocument();
});

test('one import of the student record is shared by conditions and graduation gaps, survives a reload, and stores no names', async () => {
  const user = userEvent.setup();
  const storage = memoryStorage();
  const exportJson = (await import('../../../packages/engine/test/fixtures/synthetic/student-export.json')).default;
  const first = render(<App catalog={fakeCatalog()} storage={storage} guide={false} />);
  await screen.findByText('115-1');
  const rail = screen.getByRole('navigation', { name: '工具' });
  await user.click(within(rail).getByRole('button', { name: '條件' }));
  await user.upload(shown(screen.getAllByLabelText('上傳全人系統匯出檔')), new File([JSON.stringify(exportJson)], 'e.json', { type: 'application/json' }));
  expect(shown(await screen.findAllByText(/學士班四年級/))).toBeInTheDocument();
  first.unmount();
  render(<App catalog={fakeCatalog()} storage={storage} guide={false} />);
  await screen.findByText('115-1');
  await user.click(within(screen.getByRole('navigation', { name: '工具' })).getByRole('button', { name: '畢業缺口' }));
  expect(shown(await screen.findAllByText(/學校審查資料日期 2026-10-26/))).toBeInTheDocument();
  expect(JSON.stringify(storage.values)).not.toMatch(/王合成|SYNTHETIC-0001/);
});

// 第五輪審查（2026-11-01）
test('drops the student record when another tab clears it', async () => {
  const { RECORD_KEY } = await import('@campusward/engine');
  const user = userEvent.setup();
  const storage = memoryStorage();
  const exportJson = (await import('../../../packages/engine/test/fixtures/synthetic/student-export.json')).default;
  render(<App catalog={fakeCatalog()} storage={storage} guide={false} />);
  await screen.findByText('115-1');
  const rail = screen.getByRole('navigation', { name: '工具' });
  await user.click(within(rail).getByRole('button', { name: '畢業缺口' }));
  await user.upload(shown(screen.getAllByLabelText('上傳全人系統匯出檔')), new File([JSON.stringify(exportJson)], 'e.json', { type: 'application/json' }));
  expect(shown(await screen.findAllByText(/學校審查資料日期/))).toBeInTheDocument();
  storage.values[RECORD_KEY] = '';
  window.dispatchEvent(new StorageEvent('storage', { key: RECORD_KEY, newValue: '' }));
  await waitFor(() => expect(screen.queryAllByText(/學校審查資料日期/).filter((element) => !element.closest('[hidden]'))).toEqual([]));
});

test('clearing local data also clears course names typed into the graduation gaps', async () => {
  const user = userEvent.setup();
  render(<App catalog={fakeCatalog()} storage={memoryStorage()} guide={false} />);
  await screen.findByText('115-1');
  const rail = screen.getByRole('navigation', { name: '工具' });
  await user.click(within(rail).getByRole('button', { name: '畢業缺口' }));
  await user.type(shown(screen.getAllByLabelText('要補的課名')), '秘密補修課');
  await user.click(shown(screen.getAllByRole('button', { name: '找本學期開課' })));
  expect(screen.getByText('秘密補修課')).toBeInTheDocument();
  await user.click(within(rail).getByRole('button', { name: '匯出與資料' }));
  await user.click(screen.getByRole('button', { name: '清除本機資料' }));
  await user.click(screen.getByRole('button', { name: '確認清除' }));
  expect(screen.queryByText('秘密補修課')).not.toBeInTheDocument();
});

// 稽核第二批（2026-11-01）：候選清單、學分上下限提示、單門移出不自動備份。
describe('planner fixes', () => {
  const rows = [
    officialRow({ subNum: '042112001', subNam: '臺灣政治', subTime: '三78E' }),
    officialRow({ subNum: '000603001', subNam: '民法概要', subTime: '三78' }),
    officialRow({ subNum: '900003001', subNam: '週五課', subTime: '五34' }),
  ];
  const search = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    const box = screen.getByRole('searchbox', { name: '搜課' });
    await user.clear(box);
    await user.type(box, text);
  };

  test('the candidate list shows hearted courses, adds one to the timetable and removes another', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await search(user, '臺灣政治');
    await user.click(await screen.findByRole('button', { name: '加入課表：臺灣政治' }));
    await search(user, '民法概要');
    await user.click(screen.getByRole('button', { name: '加入候選：民法概要' }));
    await user.click(within(screen.getByRole('navigation', { name: '工具' })).getByRole('button', { name: '候選' }));
    const list = screen.getByRole('region', { name: '候選清單' });
    const row = within(list).getAllByRole('article').find((article) => article.textContent?.includes('民法概要'))!;
    expect(row).toHaveTextContent('與「臺灣政治」衝堂');
    await user.click(within(row).getByRole('button', { name: '加入課表：民法概要' }));
    expect(screen.getByRole('status', { name: '最近的修改' })).toHaveTextContent('已加入「民法概要」，與「臺灣政治」衝堂');
    expect(row).toHaveTextContent('已在課表');
    await user.click(within(list).getByRole('button', { name: /^(移除候選|從候選與目前課表移除)：臺灣政治$/ }));
    expect(screen.getByRole('status', { name: '最近的修改' })).toHaveTextContent('已移出候選「臺灣政治」');
    expect(within(list).getAllByRole('article')).toHaveLength(1);
  });

  test('the phone menu opens the candidate list', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    const nav = screen.getByRole('navigation', { name: '主要分頁' });
    await user.click(within(nav).getByRole('button', { name: '更多' }));
    await user.click(within(screen.getByRole('list', { name: '更多工具' })).getByRole('button', { name: '候選' }));
    expect(document.querySelector('[data-mobile-view="candidates"]')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /候選/ })).toBeInTheDocument();
  });

  test('without a year the credits ask for one, and the button opens the identity settings; with a year they show the range', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    await screen.findByText('115-1');
    await user.click(screen.getByRole('button', { name: '設定年級後可檢查學分上下限' }));
    const year = screen.getByRole('combobox', { name: '年級' });
    expect(year).toHaveFocus();
    await user.selectOptions(year, '2');
    expect(shown(screen.getAllByText(/共/))).toHaveTextContent('共 0 學分（12–25）');
    expect(screen.queryByRole('button', { name: '設定年級後可檢查學分上下限' })).toBeNull();
  });

  test('removing courses one at a time never adds an automatic backup', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    render(<App catalog={fakeCatalog({}, rows)} storage={storage} guide={false} />);
    await screen.findByText('115-1');
    for (const title of ['臺灣政治', '週五課']) {
      await search(user, title);
      await user.click(await screen.findByRole('button', { name: `加入課表：${title}` }));
    }
    for (let round = 0; round < 3; round += 1) {
      for (const title of ['臺灣政治', '週五課']) {
        await search(user, title);
        await user.click(screen.getByRole('button', { name: `移出課表：${title}` }));
        await user.click(screen.getByRole('button', { name: `加入課表：${title}` }));
      }
    }
    expect(screen.queryByRole('dialog', { name: '自動備案已滿' })).toBeNull();
    expect(within(screen.getByRole('group', { name: '方案' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['主方案', '備案']);
  });
});

describe('timetable course panel and the conflict nudge', () => {
  const rows = [
    officialRow({ subNum: '042112001', subNam: '臺灣政治', subTime: '三78E', teaNam: '李合成' }),
    officialRow({ subNum: '000603001', subNam: '民法概要', subTime: '三78', teaNam: '詹合成', subClassroom: '法學院101' }),
    officialRow({ subNum: '000603011', subNam: '民法概要', subTime: '一D56', teaNam: '吳合成', subClassroom: '法學院202' }),
    officialRow({ subNum: '000603021', subNam: '民法概要', subTime: '三E', teaNam: '周合成' }),
  ];
  const search = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    const box = screen.getByRole('searchbox', { name: '搜課' });
    await user.clear(box);
    await user.type(box, text);
  };
  const addClash = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('115-1');
    await search(user, '臺灣政治');
    await user.click(await screen.findByRole('button', { name: '加入課表：臺灣政治' }));
    await search(user, '000603001');
    await user.click(await screen.findByRole('button', { name: '加入課表：民法概要' }));
  };
  const nudgeText = '有 1 個衝堂，要我幫忙看看嗎？';

  test('a course card shows its details and swaps to another section in one undoable change, without an automatic backup', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    await addClash(user);
    const grid = screen.getByRole('group', { name: '每週課表' });
    await user.click(within(grid).getByRole('button', { name: /民法概要.*衝堂/ }));
    const panel = screen.getByRole('group', { name: '民法概要 的操作' });
    expect(panel).toHaveTextContent('詹合成');
    expect(panel).toHaveTextContent('法學院101');
    const swap = within(panel).getByRole('region', { name: '換一班' });
    expect(swap).toHaveTextContent('吳合成');
    expect(swap).not.toHaveTextContent('周合成');
    await user.click(within(swap).getByRole('button', { name: /換這班：吳合成/ }));
    const toast = screen.getByRole('status', { name: '最近的修改' });
    expect(toast).toHaveTextContent('已把「民法概要」換成吳合成 週一 D56 那一班');
    expect(screen.queryByRole('list', { name: '提醒' })?.textContent ?? '').not.toContain('每週時段重疊');
    expect(within(grid).queryByRole('button', { name: /衝堂/ })).toBeNull();
    expect(within(screen.getByRole('group', { name: '方案' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['主方案', '備案']);
    await user.click(within(toast).getByRole('button', { name: '復原' }));
    expect(within(grid).getByRole('button', { name: /民法概要.*衝堂/ })).toBeInTheDocument();
  });

  test('without a Gemini key, the nudge opens the clashing course with its other sections instead of the AI setup', async () => {
    const user = userEvent.setup();
    const ai = { hasKey: () => false, setKey: vi.fn(), removeKey: vi.fn(), generate: vi.fn() };
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} ai={ai} guide={false} />);
    await addClash(user);
    await user.click(screen.getByRole('button', { name: nudgeText }));
    expect(screen.getByRole('button', { name: '小山' })).toHaveAttribute('aria-expanded', 'false');
    const panel = screen.getByRole('group', { name: '民法概要 的操作' });
    expect(within(panel).getByRole('region', { name: '換一班' })).toHaveTextContent('吳合成');
    expect(ai.generate).not.toHaveBeenCalled();
  });

  test('the nudge steps aside while a course panel or the phone menu is open', async () => {
    const user = userEvent.setup();
    render(<App catalog={fakeCatalog({}, rows)} storage={memoryStorage()} guide={false} />);
    await addClash(user);
    expect(screen.getByRole('button', { name: nudgeText })).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: '每週課表' })).getByRole('button', { name: /臺灣政治/ }));
    expect(screen.queryByRole('button', { name: nudgeText })).toBeNull();
    await user.click(screen.getByRole('button', { name: '關閉操作' }));
    // 被蓋過一次就收成小紅點，不再彈回來擋畫面（手機每次換頁都會開「更多」）；報讀器仍念得到。
    expect(screen.queryByRole('button', { name: nudgeText })).toBeNull();
    expect(screen.getByRole('button', { name: '小山' })).toHaveAccessibleDescription(nudgeText);
    await user.click(within(screen.getByRole('navigation', { name: '主要分頁' })).getByRole('button', { name: '更多' }));
    expect(screen.queryByRole('button', { name: nudgeText })).toBeNull();
  });

  test('a dismissed nudge stays dismissed after a reload until the clashes change, and clearing local data forgets it', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = render(<App catalog={fakeCatalog({}, rows)} storage={storage} guide={false} />);
    await addClash(user);
    await user.click(screen.getByRole('button', { name: '不用了，關掉提醒' }));
    first.unmount();
    const second = render(<App catalog={fakeCatalog({}, rows)} storage={storage} guide={false} />);
    await screen.findByText('115-1');
    await screen.findByRole('group', { name: '每週課表' });
    expect(screen.queryByRole('button', { name: nudgeText })).toBeNull();
    // 衝堂組合變了（多一門和臺灣政治衝堂的課）就再提醒。
    await search(user, '000603021');
    await user.click(await screen.findByRole('button', { name: '加入課表：民法概要' }));
    expect(await screen.findByRole('button', { name: /個衝堂，要我幫忙看看嗎？/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '不用了，關掉提醒' }));
    expect(storage.getItem('campusward:v1:nudge-dismissed')).toBeTruthy();
    await user.click(within(screen.getByRole('navigation', { name: '工具' })).getByRole('button', { name: '匯出與資料' }));
    await user.click(await screen.findByRole('button', { name: '清除本機資料' }));
    await user.click(screen.getByRole('button', { name: '確認清除' }));
    expect(storage.getItem('campusward:v1:nudge-dismissed') ?? '').toBe('');
    second.unmount();
  });
});
