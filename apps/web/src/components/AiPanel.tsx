import { safeExternalUrl, toScheduleCourse, type AiApplyResult, type Change, type Course, type CourseCorrection, type PlannerState, type ScheduleCourse } from '@campusward/engine';
import { KeyRound, Send, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { GeminiClient } from '../ai/gemini.ts';
import { aiSearch, planWithAi } from '../ai/orb.ts';
import { OrbMark } from './OrbMark.tsx';
import { CareerSection } from './CareerSection.tsx';
import { ScreenshotImport } from './ScreenshotImport.tsx';

export const GEMINI_TERMS_URL = safeExternalUrl('https://ai.google.dev/gemini-api/terms', ['ai.google.dev']);
const KEY_HELP_URL = safeExternalUrl('https://aistudio.google.com/apikey', ['aistudio.google.com']);

export interface AiPanelProps {
  client: GeminiClient;
  termLabel: string;
  planner: PlannerState;
  catalog: ReadonlyMap<string, ScheduleCourse>;
  courses: readonly Course[];
  ready: boolean;
  onApply: (changes: Change[], label: string, replaceOldestAutoBackup?: boolean) => AiApplyResult;
}

type Outcome =
  | { kind: 'applied'; demo: boolean; answer: string; added: string[]; removed: string[]; corrections: CourseCorrection[]; backups: number }
  | { kind: 'answered'; answer: string }
  | { kind: 'rejected'; answer: string; reasons: string[] }
  | { kind: 'confirm'; answer: string; changes: Change[]; label: string; corrections: CourseCorrection[]; demo: boolean }
  | { kind: 'failed'; message: string };

const action = 'btn btn-sm min-h-11 gap-1.5 border border-base-300 bg-base-100';
const CODE = /([0-9A-Z]{9})/;

/** AI 回覆只當純文字顯示（不渲染 HTML、Markdown 圖片或連結）；文中的課號比對快照，查無者標示。 */
function AnswerText({ text, catalog }: { text: string; catalog: ReadonlyMap<string, ScheduleCourse> }) {
  const codes = new Set([...catalog.values()].flatMap(({ code }) => (code ? [code] : [])));
  return (
    <>
      {text.split('\n').filter((line) => line.trim()).map((line, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">
          {line.split(CODE).map((part, partIndex) => (
            CODE.test(part) && part.length === 9 && !codes.has(part)
              ? <span key={partIndex}>{part}<span className="text-coral-ink">（快照查無此課號）</span></span>
              : <span key={partIndex}>{part}</span>
          ))}
        </p>
      ))}
    </>
  );
}

export function AiPanel({ client, termLabel, planner, catalog, courses, ready, onApply }: AiPanelProps) {
  const [accepted, setAccepted] = useState(false);
  const [hasKey, setHasKey] = useState(() => client.hasKey());
  const [keyError, setKeyError] = useState('');
  const keyInput = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(false);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const titleOf = (key: string) => catalog.get(key)?.title ?? key;

  const finish = (result: AiApplyResult, answer: string, corrections: CourseCorrection[], changes: Change[], label: string, demo: boolean) => {
    if (result.status === 'applied') {
      setOutcome({ kind: 'applied', demo, answer, added: result.diff.added, removed: result.diff.removed, corrections, backups: result.autoBackupPlanIds.length });
    } else if (result.status === 'needsConfirmation') {
      setOutcome({ kind: 'confirm', answer, changes, label, corrections, demo });
    } else {
      setOutcome({ kind: 'rejected', answer, reasons: result.violations.map(({ message }) => message) });
    }
  };

  const saveKey = () => {
    // 金鑰直接從輸入框交給用戶端閉包，不經過 React 狀態；存好就清空輸入框。
    const input = keyInput.current;
    if (!input) return;
    try {
      client.setKey(input.value, remember);
      input.value = '';
      setKeyError('');
      setHasKey(true);
    } catch {
      setKeyError('這不像 Gemini 金鑰：請從 Google AI Studio 複製完整的金鑰再貼上。');
    }
  };

  const send = async () => {
    const text = request.trim();
    if (!text || !accepted || !hasKey || busy) return;
    setBusy(true);
    setOutcome(null);
    const plan = await planWithAi({ client, request: text, termLabel, planner, catalog, courses });
    setBusy(false);
    if (plan.status === 'failed') {
      setOutcome({ kind: 'failed', message: plan.message });
      return;
    }
    if (!plan.changes.length) {
      setOutcome({ kind: 'answered', answer: plan.answer || 'AI 沒有修改課表。' });
      return;
    }
    const label = 'AI 已修改課表';
    finish(onApply(plan.changes, label), plan.answer, plan.corrections, plan.changes, label, false);
  };

  // 示範：不呼叫 AI，播放一份預先寫好的變更方案（從本學期快照挑一門不衝堂的通識），一樣可以復原。
  const demo = () => {
    const scheduled = new Set(planner.plans.find(({ id }) => id === planner.activePlanId)?.items.map(({ key }) => key));
    const pick = aiSearch(courses, '通識').map((course) => toScheduleCourse(course).key).find((key) => catalog.has(key) && !scheduled.has(key));
    if (!pick) {
      setOutcome({ kind: 'answered', answer: '示範：這學期的資料裡找不到可以示範的課。' });
      return;
    }
    const changes: Change[] = [{ type: 'addToSchedule', key: pick }];
    const answer = `（示範）我幫你加了「${titleOf(pick)}」。真正使用時，AI 會照你的需求搜課與排課。`;
    finish(onApply(changes, '示範：AI 已修改課表'), answer, [], changes, '示範：AI 已修改課表', true);
  };

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <div className="flex items-center gap-3">
        <OrbMark size={40} />
        <div>
          <p className="font-medium">AI 光球</p>
          <p className="text-xs text-base-content/75">說出需求，AI 直接幫你搜課排課；衝堂、鎖定課與學分會先檢查，做錯可以復原。</p>
        </div>
      </div>

      {!accepted && (
        <label className="flex items-start gap-2 rounded-field border border-base-300 px-3 py-2">
          <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>
            我已年滿 18 歲，並讀過 <a className="link" href={GEMINI_TERMS_URL} target="_blank" rel="noopener noreferrer">Gemini API 條款</a>
            。送出的需求與必要的課程資料會交給 Google 處理；免費額度的內容可能被用來改進 Google 產品，請不要寫入個資。
          </span>
        </label>
      )}

      {accepted && !hasKey && (
        <form className="space-y-2 rounded-field border border-base-300 px-3 py-2" onSubmit={(event) => { event.preventDefault(); saveKey(); }}>
          <p>
            用你自己的 Gemini 金鑰（免費申請：<a className="link" href={KEY_HELP_URL} target="_blank" rel="noopener noreferrer">Google AI Studio</a>
            ，說明見<a className="link" href="/privacy#gemini">隱私說明</a>）。金鑰只放在這個分頁的記憶體，重新整理就要重貼。
          </p>
          <label className="input input-sm min-h-11 w-full">
            <KeyRound className="size-4" aria-hidden="true" />
            <span className="sr-only">Gemini 金鑰</span>
            <input ref={keyInput} type="password" autoComplete="off" spellCheck={false} placeholder="貼上 Gemini 金鑰" />
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="checkbox checkbox-sm" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            這個分頁記住金鑰（關掉分頁就清除）
          </label>
          {keyError && <p role="alert" className="text-coral-ink">{keyError}</p>}
          <button type="submit" className={action}>使用這把金鑰</button>
        </form>
      )}

      {accepted && hasKey && (
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <label className="block">
            <span className="sr-only">想怎麼排</span>
            <textarea
              className="textarea min-h-24 w-full"
              value={request}
              maxLength={1000}
              placeholder="例如：幫我加一門週三下午的通識，不要早八"
              onChange={(event) => setRequest(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm min-h-11 gap-1.5" disabled={!ready || busy || !request.trim()}>
              <Send className="size-4" aria-hidden="true" />{busy ? 'AI 處理中…' : '送出'}
            </button>
            <button type="button" className={action} onClick={() => { client.removeKey(); setHasKey(false); }}>
              <Trash2 className="size-4" aria-hidden="true" />移除金鑰
            </button>
          </div>
        </form>
      )}

      {accepted && hasKey && ready && (
        <>
          <CareerSection client={client} termLabel={termLabel} courses={courses} candidateKeys={new Set(planner.candidates)} onAddCandidates={(changes, label) => { onApply(changes, label); }} />
          <ScreenshotImport client={client} termLabel={termLabel} planner={planner} courses={courses} onAddCandidates={(changes, label) => { onApply(changes, label); }} />
        </>
      )}

      {!hasKey && (
        <button type="button" className={`${action} self-start`} onClick={demo} disabled={!ready}>看示範</button>
      )}

      <div aria-live="polite" className="space-y-2">
        {outcome?.kind === 'failed' && <p role="alert" className="text-coral-ink">{outcome.message}</p>}
        {outcome && outcome.kind !== 'failed' && (
          <div className="space-y-2 rounded-field border border-base-300 px-3 py-2">
            {outcome.kind === 'applied' && (
              <p className="font-medium">
                {outcome.demo && <span className="badge badge-sm mr-1 border-primary/40">示範</span>}
                已幫你{[
                  outcome.added.length ? `加入 ${outcome.added.length} 門課` : '',
                  outcome.removed.length ? `移出 ${outcome.removed.length} 門課` : '',
                ].filter(Boolean).join('、') || '修改課表'}
                ，可以按下方「復原」。{outcome.backups > 0 && `改動前的課表已另存成自動備案。`}
              </p>
            )}
            {outcome.kind === 'applied' && outcome.added.length > 0 && <p>加入：{outcome.added.map(titleOf).join('、')}</p>}
            {outcome.kind === 'applied' && outcome.removed.length > 0 && <p>移出：{outcome.removed.map(titleOf).join('、')}</p>}
            {(outcome.kind === 'applied' || outcome.kind === 'confirm') && outcome.corrections.map(({ from, key }) => (
              <p key={from} className="text-xs">已修正課號：AI 寫的 {from} 改成 {catalog.get(key)?.code ?? key}（{titleOf(key)}）。</p>
            ))}
            {outcome.kind === 'rejected' && (
              <div>
                <p className="font-medium">沒有修改課表，因為：</p>
                <ul className="list-disc pl-5">{outcome.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              </div>
            )}
            {outcome.kind === 'confirm' && (
              <div className="space-y-2">
                <p>改動前要另存自動備案，但自動備案已滿。要刪掉最舊的一份再套用嗎？</p>
                <button
                  type="button"
                  className={action}
                  onClick={() => finish(onApply(outcome.changes, outcome.label, true), outcome.answer, outcome.corrections, outcome.changes, outcome.label, outcome.demo)}
                >
                  刪掉最舊的並套用
                </button>
              </div>
            )}
            {outcome.answer && <AnswerText text={outcome.answer} catalog={catalog} />}
          </div>
        )}
      </div>
    </div>
  );
}
