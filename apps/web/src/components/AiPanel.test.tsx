import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { applyAiChangeSet, createPlannerState, rowToCourse, toScheduleCourse, type Change, type Course } from '@campusward/engine';
import { describe, expect, test, vi } from 'vitest';
import { officialRow } from '../../../../packages/engine/test/fixtures/synthetic/official-rows.ts';
import { createGeminiClient } from '../ai/gemini.ts';
import { memoryStorage } from '../test/memoryStorage.ts';
import { AiPanel, type AiPanelProps } from './AiPanel.tsx';

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
async function unlock(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ }));
  await user.type(screen.getByLabelText('Gemini 金鑰'), KEY);
  await user.click(screen.getByRole('button', { name: '使用這把金鑰' }));
}

describe('AiPanel', () => {
  test('asks for the age and terms confirmation before anything can be sent', () => {
    const { fetchImpl } = setup();
    expect(screen.queryByLabelText('Gemini 金鑰')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '送出' })).not.toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('keeps the key out of the page once saved', async () => {
    const { user, client } = setup();
    await unlock(user);
    expect(client.hasKey()).toBe(true);
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(screen.queryByLabelText('Gemini 金鑰')).not.toBeInTheDocument();
  });

  test('applies the change set from the model and says what changed', async () => {
    const { user, onApply, fetchImpl } = setup([reply([{ type: 'addToSchedule', course: '900001001' }, { type: 'answer', text: '加了統計學。' }])]);
    await unlock(user);
    await user.type(screen.getByLabelText('想怎麼排'), '加統計學');
    await user.click(screen.getByRole('button', { name: '送出' }));
    expect(await screen.findByText(/已幫你加入 1 門課/)).toBeInTheDocument();
    expect(screen.getByText('加入：統計學')).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledWith([{ type: 'addToSchedule', key: '1151:900001001' }], 'AI 已修改課表');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('explains why a change set was not applied', async () => {
    const { user } = setup([reply([{ type: 'addToSchedule', course: '900001001' }, { type: 'addToSchedule', course: '900002001' }])]);
    await unlock(user);
    await user.type(screen.getByLabelText('想怎麼排'), '兩門都加');
    await user.click(screen.getByRole('button', { name: '送出' }));
    expect(await screen.findByText('沒有修改課表，因為：')).toBeInTheDocument();
    expect(screen.getByText(/每週時段重疊/)).toBeInTheDocument();
  });

  test('shows the answer as plain text without images and marks unknown course codes', async () => {
    const { user } = setup([reply([{ type: 'answer', text: '可以考慮 999999999 ![x](https://a.example/x.png) <img src=x>' }])]);
    await unlock(user);
    await user.type(screen.getByLabelText('想怎麼排'), '推薦一下');
    await user.click(screen.getByRole('button', { name: '送出' }));
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

  test('removes the key', async () => {
    const { user, client } = setup();
    await unlock(user);
    await user.click(screen.getByRole('button', { name: '移除金鑰' }));
    expect(client.hasKey()).toBe(false);
    expect(screen.getByLabelText('Gemini 金鑰')).toBeInTheDocument();
  });
});

test('hides features that are switched off', async () => {
  const features = { orb: true, demo: false, qa: false, career: false, screenshot: false, graduation: true, liveCheck: true };
  const syllabi = { terms: vi.fn(async () => []), loadIndex: vi.fn(), loadCourse: vi.fn() };
  const { user } = setup([], { features, term: '1151', syllabi });
  expect(screen.queryByRole('button', { name: '看示範' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '問課綱' })).not.toBeInTheDocument();
  await unlock(user);
  expect(screen.getByLabelText('想怎麼排')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '職涯方向找課' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '截圖匯入' })).not.toBeInTheDocument();
});

test('the key field is not a password field, so browsers do not offer to save the key', () => {
  setup();
  return userEvent.setup().click(screen.getByRole('checkbox', { name: /我已年滿 18 歲/ })).then(() => {
    const field = screen.getByLabelText('Gemini 金鑰');
    expect(field).not.toHaveAttribute('type', 'password');
    expect(field.closest('form')).toBeNull();
    expect(field).toHaveAttribute('data-1p-ignore');
  });
});
