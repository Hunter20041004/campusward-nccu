import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { applyAiChangeSet, createPlannerState, rowToCourse, toScheduleCourse, type Change, type Course } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { createGeminiClient } from '../ai/gemini.ts';
import { memoryStorage } from '../test/memoryStorage.ts';
import { AiPanel, type AiPanelProps } from './AiPanel.tsx';
import { BuddyProvider } from '../buddy/BuddyContext.tsx';
import { createBuddyHub } from '../buddy/hub.ts';

const KEY = 'AIzaSyTEST-not-a-real-key-000000000000';
const courseOf = (code: string, title: string, subTime: string, lmtKind = ''): Course => {
  const { course } = rowToCourse(officialRow({ subNum: code, subNam: title, subTime, lmtKind }), { year: 115, semester: 1 });
  if (!course) throw new Error('rejected');
  return course;
};
const courses = [courseOf('900001001', '統計學', '一234'), courseOf('900002001', '會計學', '一34'), courseOf('900003001', '人文通識', '三D56', '人文通識')];
const catalog = new Map(courses.map((course) => [toScheduleCourse(course).key, toScheduleCourse(course)]));
const reply = (actions: unknown[]) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ actions }) }] }, finishReason: 'STOP' }] }));

function setup(responses: Response[] = [], overrides: Partial<AiPanelProps> = {}) {
  const fetchImpl = vi.fn(async () => responses.shift() ?? new Response('{}', { status: 500 }));
  const client = createGeminiClient({ fetchImpl, session: memoryStorage() });
  const planner = createPlannerState();
  const onApply = vi.fn((changes: Change[], _label: string, replace?: boolean) => applyAiChangeSet(planner, changes, catalog, { profile: {}, ...(replace ? { replaceOldestAutoBackup: true } : {}) }));
  render(<AiPanel client={client} termLabel="115-1" planner={planner} catalog={catalog} courses={courses} ready onApply={onApply} {...overrides} />);
  return { fetchImpl, onApply, client, user: userEvent.setup() };
}
/** 先按「設定 AI」完成年齡確認與金鑰（送出需求時沒設定也會自動跳出同一張卡）。 */
async function unlock(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '設定 AI' }));
  await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
  await user.type(screen.getByLabelText('Gemini 金鑰'), KEY);
  await user.click(screen.getByRole('button', { name: '使用這把金鑰' }));
}
async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText('想怎麼排'), text);
  await user.click(screen.getByRole('button', { name: '送出' }));
}

describe('AiPanel', () => {
  test('asks for the age and terms confirmation before anything can be sent', async () => {
    const { fetchImpl, user } = setup();
    expect(screen.queryByLabelText('Gemini 金鑰')).not.toBeInTheDocument();
    await ask(user, '加統計學');
    expect(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Gemini 金鑰')).not.toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('sends the waiting request by itself once the AI is set up', async () => {
    const { user, fetchImpl } = setup([reply([{ type: 'answer', text: '好的。' }])]);
    await ask(user, '推薦一門課');
    await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
    await user.type(screen.getByLabelText('Gemini 金鑰'), KEY);
    await user.click(screen.getByRole('button', { name: '使用這把金鑰' }));
    expect(await screen.findByText('好的。')).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(screen.getByText('推薦一門課')).toBeInTheDocument();
  });

  test('keeps the key out of the page once saved', async () => {
    const { user, client } = setup();
    await unlock(user);
    expect(client.hasKey()).toBe(true);
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(screen.queryByLabelText('Gemini 金鑰')).not.toBeInTheDocument();
  });

  test('applies the change set from the model, says what changed, and offers to show or undo it', async () => {
    const onShowTimetable = vi.fn();
    const onUndo = vi.fn();
    const { user, onApply, fetchImpl } = setup([reply([{ type: 'addToSchedule', course: '900001001' }, { type: 'answer', text: '加了統計學。' }])], { onShowTimetable, onUndo, undoLabel: 'AI 已修改課表' });
    await unlock(user);
    await ask(user, '加統計學');
    expect(await screen.findByText(/已幫你加入 1 門課/)).toBeInTheDocument();
    expect(screen.getByText('加入：統計學')).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith([{ type: 'addToSchedule', key: '1151:900001001' }], 'AI 已修改課表');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '看課表' }));
    expect(onShowTimetable).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '復原' }));
    expect(onUndo).toHaveBeenCalled();
    expect(screen.getByText('已復原這次修改。')).toBeInTheDocument();
  });

  test('keeps the conversation so earlier answers stay readable', async () => {
    const { user } = setup([reply([{ type: 'answer', text: '第一個回答。' }]), reply([{ type: 'answer', text: '第二個回答。' }])]);
    await unlock(user);
    await ask(user, '第一個問題');
    await screen.findByText('第一個回答。');
    await ask(user, '第二個問題');
    await screen.findByText('第二個回答。');
    for (const text of ['第一個問題', '第一個回答。', '第二個問題']) expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('explains why a change set was not applied', async () => {
    const { user } = setup([reply([{ type: 'addToSchedule', course: '900001001' }, { type: 'addToSchedule', course: '900002001' }])]);
    await unlock(user);
    await ask(user, '兩門都加');
    expect(await screen.findByText('沒有修改課表，因為：')).toBeInTheDocument();
    expect(screen.getByText(/每週時段重疊/)).toBeInTheDocument();
  });

  test('shows the answer as plain text without images and marks unknown course codes', async () => {
    const { user } = setup([reply([{ type: 'answer', text: '可以考慮 999999999 ![x](https://a.example/x.png) <img src=x>' }])]);
    await unlock(user);
    await ask(user, '推薦一下');
    expect(await screen.findByText('（快照查無此課號）')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('a[href^="https://a.example"]')).toBeNull();
  });

  test('plays a demo without a key and labels it', async () => {
    const { user, onApply, fetchImpl } = setup();
    await user.click(screen.getByRole('button', { name: '看示範' }));
    expect(await screen.findByText('示範')).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith([{ type: 'addToSchedule', key: '1151:900003001' }], '示範：AI 已修改課表');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('the demo finds a general-education course whose title does not say 通識', async () => {
    const realistic = [courseOf('900001001', '統計學', '一234'), courseOf('900004001', '哲學與人生', '二D56', '人文通識')];
    const realCatalog = new Map(realistic.map((course) => [toScheduleCourse(course).key, toScheduleCourse(course)]));
    const planner = createPlannerState();
    const onApply = vi.fn((changes: Change[]) => applyAiChangeSet(planner, changes, realCatalog, { profile: {} }));
    setup([], { courses: realistic, catalog: realCatalog, onApply });
    await userEvent.setup().click(screen.getByRole('button', { name: '看示範' }));
    expect(onApply).toHaveBeenCalledWith([{ type: 'addToSchedule', key: '1151:900004001' }], '示範：AI 已修改課表');
    expect(await screen.findByText(/我幫你加了「哲學與人生」/)).toBeInTheDocument();
    expect(screen.queryByText(/找不到可以示範的課/)).not.toBeInTheDocument();
  });

  test('removes the key', async () => {
    const { user, client } = setup();
    await unlock(user);
    await user.click(screen.getByRole('button', { name: '移除金鑰' }));
    expect(client.hasKey()).toBe(false);
    expect(screen.getByRole('button', { name: '設定 AI' })).toBeInTheDocument();
  });

  test('switches between planning, syllabus questions, career and screenshots from one row of chips', async () => {
    const syllabi = { terms: vi.fn(async () => []), loadIndex: vi.fn(), loadCourse: vi.fn() };
    const { user } = setup([], { term: '1151', syllabi });
    const modes = screen.getByRole('group', { name: '小山能幫的事' });
    await user.click(within(modes).getByRole('button', { name: '問課綱' }));
    expect(within(modes).getByRole('button', { name: '問課綱' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: '問課綱' })).toBeInTheDocument();
    expect(screen.queryByLabelText('想怎麼排')).not.toBeInTheDocument();
    await user.click(within(modes).getByRole('button', { name: '職涯' }));
    expect(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ })).toBeInTheDocument();
    await user.click(within(modes).getByRole('button', { name: '排課' }));
    expect(screen.getByLabelText('想怎麼排')).toBeInTheDocument();
  });
});

test('hides features that are switched off', async () => {
  const features = { orb: true, demo: false, qa: false, career: false, screenshot: false, graduation: true, liveCheck: true };
  const syllabi = { terms: vi.fn(async () => []), loadIndex: vi.fn(), loadCourse: vi.fn() };
  const { user } = setup([], { features, term: '1151', syllabi });
  expect(screen.queryByRole('button', { name: '看示範' })).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: '小山能幫的事' })).not.toBeInTheDocument();
  await unlock(user);
  expect(screen.getByLabelText('想怎麼排')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '問課綱' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '職涯方向找課' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '截圖匯入' })).not.toBeInTheDocument();
});

test('the key field is not a password field, so browsers do not offer to save the key', async () => {
  const { user } = setup();
  await user.click(screen.getByRole('button', { name: '設定 AI' }));
  await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
  const field = screen.getByLabelText('Gemini 金鑰');
  expect(field).not.toHaveAttribute('type', 'password');
  expect(field.closest('form')).toBeNull();
  expect(field).toHaveAttribute('data-1p-ignore');
});

describe('the buddy follows the AI request', () => {
  const withHub = () => {
    const hub = createBuddyHub({ storage: memoryStorage() });
    return { hub, aiStart: vi.spyOn(hub, 'aiStart'), aiResult: vi.spyOn(hub, 'aiResult'), wrapper: ({ children }: { children: React.ReactNode }) => <BuddyProvider hub={hub}>{children}</BuddyProvider> };
  };

  test('thinks while waiting and hears that the change was applied', async () => {
    const { hub, aiStart, aiResult, wrapper } = withHub();
    const fetchImpl = vi.fn(async () => reply([{ type: 'addToSchedule', course: '900001001' }, { type: 'answer', text: '加了統計學。' }]));
    const client = createGeminiClient({ fetchImpl, session: memoryStorage() });
    const planner = createPlannerState();
    render(<AiPanel client={client} termLabel="115-1" planner={planner} catalog={catalog} courses={courses} ready onApply={(changes) => applyAiChangeSet(planner, changes, catalog, { profile: {} })} />, { wrapper });
    const user = userEvent.setup();
    await unlock(user);
    await ask(user, '加統計學');
    expect(aiStart).toHaveBeenCalled();
    await screen.findByText(/已幫你加入 1 門課/);
    expect(aiResult).toHaveBeenCalledWith('applied', '加了統計學。'.length, expect.any(Function));
    hub.destroy();
  });

  test('tells the buddy when the request failed', async () => {
    const { hub, aiResult, wrapper } = withHub();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }));
    const client = createGeminiClient({ fetchImpl, session: memoryStorage() });
    render(<AiPanel client={client} termLabel="115-1" planner={createPlannerState()} catalog={catalog} courses={courses} ready onApply={vi.fn()} />, { wrapper });
    const user = userEvent.setup();
    await unlock(user);
    await ask(user, '加統計學');
    await screen.findByRole('alert');
    expect(aiResult).toHaveBeenCalledWith('failed', 0);
    hub.destroy();
  });
});

describe('fixes from the review', () => {
  test('with a remembered key, agreeing to the terms sends the waiting request', async () => {
    const fetchImpl = vi.fn(async () => reply([{ type: 'answer', text: '收到。' }]));
    const client = createGeminiClient({ fetchImpl, session: memoryStorage() });
    client.setKey(KEY, false);
    render(<AiPanel client={client} termLabel="115-1" planner={createPlannerState()} catalog={catalog} courses={courses} ready onApply={vi.fn()} />);
    const user = userEvent.setup();
    await ask(user, '推薦一門');
    await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
    expect(await screen.findByText('收到。')).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('an old waiting request is never sent again after the key is removed and set up again', async () => {
    const fetchImpl = vi.fn(async () => reply([{ type: 'answer', text: '收到。' }]));
    const client = createGeminiClient({ fetchImpl, session: memoryStorage() });
    client.setKey(KEY, false);
    render(<AiPanel client={client} termLabel="115-1" planner={createPlannerState()} catalog={catalog} courses={courses} ready onApply={vi.fn()} />);
    const user = userEvent.setup();
    await ask(user, '舊的需求');
    await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
    await screen.findByText('收到。');
    await user.click(screen.getByRole('button', { name: '移除金鑰' }));
    await user.click(screen.getByRole('button', { name: '設定 AI' }));
    await user.type(screen.getByLabelText('Gemini 金鑰'), KEY);
    await user.click(screen.getByRole('button', { name: '使用這把金鑰' }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('switching to another mode drops the waiting request', async () => {
    const syllabi = { terms: vi.fn(async () => []), loadIndex: vi.fn(), loadCourse: vi.fn() };
    const { user, fetchImpl } = setup([reply([{ type: 'answer', text: '一。' }])], { term: '1151', syllabi });
    await ask(user, '舊的需求');
    await user.click(within(screen.getByRole('group', { name: '小山能幫的事' })).getByRole('button', { name: '職涯' }));
    await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
    await user.type(screen.getByLabelText('Gemini 金鑰'), KEY);
    await user.click(screen.getByRole('button', { name: '使用這把金鑰' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('the backup-replace button works once', async () => {
    const result = { status: 'needsConfirmation', replace: 1 } as const;
    const applied = applyAiChangeSet(createPlannerState(), [{ type: 'addToSchedule', key: '1151:900001001' }], catalog, { profile: {} });
    const onApply = vi.fn((_changes: Change[], _label: string, replace?: boolean) => (replace ? applied : result as never));
    const { user } = setup([reply([{ type: 'addToSchedule', course: '900001001' }])], { onApply });
    await unlock(user);
    await ask(user, '加統計學');
    const button = await screen.findByRole('button', { name: /刪掉最舊的 1 份並套用/ });
    await user.click(button);
    expect(screen.queryByRole('button', { name: /刪掉最舊的 1 份並套用/ })).not.toBeInTheDocument();
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  test('a reply that arrives after the panel was reset (clearing local data) changes nothing', async () => {
    let resolve: (value: Response) => void = () => {};
    const fetchImpl = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    const client = createGeminiClient({ fetchImpl, session: memoryStorage() });
    const onApply = vi.fn();
    const { unmount } = render(<AiPanel client={client} termLabel="115-1" planner={createPlannerState()} catalog={catalog} courses={courses} ready onApply={onApply} />);
    const user = userEvent.setup();
    await unlock(user);
    await ask(user, '加統計學');
    unmount();
    resolve(reply([{ type: 'addToSchedule', course: '900001001' }]));
    await new Promise((done) => setTimeout(done, 20));
    expect(onApply).not.toHaveBeenCalled();
  });

  test('a key typed but not saved is wiped when the panel is hidden', async () => {
    const props = { client: createGeminiClient({ fetchImpl: vi.fn(), session: memoryStorage() }), termLabel: '115-1', planner: createPlannerState(), catalog, courses, ready: true, onApply: vi.fn() };
    const { rerender } = render(<AiPanel {...props} visible />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '設定 AI' }));
    await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
    await user.type(screen.getByLabelText('Gemini 金鑰'), 'AIza-half-typed');
    rerender(<AiPanel {...props} visible={false} />);
    expect(screen.getByLabelText('Gemini 金鑰')).toHaveValue('');
  });

  test('undoing from anywhere marks the reply as undone; only the newest reply offers undo', async () => {
    const onUndo = vi.fn();
    const props = { client: createGeminiClient({ fetchImpl: vi.fn(async () => reply([{ type: 'addToSchedule', course: '900001001' }])), session: memoryStorage() }), termLabel: '115-1', planner: createPlannerState(), catalog, courses, ready: true, onUndo, onApply: (changes: Change[]) => applyAiChangeSet(createPlannerState(), changes, catalog, { profile: {} }) };
    const { rerender } = render(<AiPanel {...props} undoLabel="AI 已修改課表" />);
    const user = userEvent.setup();
    await unlock(user);
    await ask(user, '加統計學');
    await screen.findByText(/已幫你加入 1 門課/);
    expect(screen.getByRole('button', { name: '復原' })).toBeInTheDocument();
    rerender(<AiPanel {...props} undoLabel={null} undone={{ label: 'AI 已修改課表', count: 1 }} />);
    expect(screen.getByText('已復原這次修改。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '復原' })).not.toBeInTheDocument();
  });

  test('focus stays inside the setup steps for keyboard users', async () => {
    const { user } = setup();
    await ask(user, '加統計學');
    expect(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ })).toHaveFocus();
    await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
    expect(screen.getByLabelText('Gemini 金鑰')).toHaveFocus();
  });

  test('cannot remove the key or play the demo while waiting for a reply', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const client = createGeminiClient({ fetchImpl, session: memoryStorage() });
    render(<AiPanel client={client} termLabel="115-1" planner={createPlannerState()} catalog={catalog} courses={courses} ready onApply={vi.fn()} />);
    const user = userEvent.setup();
    await unlock(user);
    await ask(user, '加統計學');
    expect(screen.getByRole('button', { name: '移除金鑰' })).toBeDisabled();
    for (const chip of within(screen.getByRole('group', { name: '小山能幫的事' })).getAllByRole('button')) expect(chip).toBeDisabled();
  });
});

// 易用性審查第 4 名（2026-11-01）：小山的衝堂建議走本機換班，不用金鑰、不呼叫 AI。
test('the briefing offers the local section swap for a clash, without a key or an AI call', async () => {
  const onClick = vi.fn();
  const briefing = { lines: ['目前 2 門、6 學分。', '統計學和會計學衝堂。'], suggestions: ['幫我補一門不衝堂的通識'], mood: 'worried' as const };
  const { user, fetchImpl } = setup([], { briefing, clashFix: { label: '換到週二 D56 那班', description: '把「會計學」換到週二 D56 那班', onClick } });
  await user.click(screen.getByRole('button', { name: '把「會計學」換到週二 D56 那班' }));
  expect(onClick).toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});
