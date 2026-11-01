import { safeExternalUrl, toScheduleCourse, type AiApplyResult, type Change, type Course, type CourseCorrection, type PlannerState, type ScheduleCourse } from '@campusward/engine';
import { BookOpenText, CalendarDays, Compass, ImageUp, KeyRound, Send, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GeminiClient } from '../ai/gemini.ts';
import { aiSearch, planWithAi } from '../ai/orb.ts';
import { AnswerText } from './AnswerText.tsx';
import { httpSyllabusSource, type SyllabusSource } from '../qa/syllabusSource.ts';
import { FEATURES, type Features } from '../features.ts';
import type { Briefing } from '../ai/briefing.ts';
import { CareerSection } from './CareerSection.tsx';
import { useBuddyHub } from '../buddy/BuddyContext.tsx';
import { Xiaoshan } from '../buddy/Xiaoshan.tsx';
import { QaSection } from './QaSection.tsx';
import { ScreenshotImport } from './ScreenshotImport.tsx';

export const GEMINI_TERMS_URL = safeExternalUrl('https://ai.google.dev/gemini-api/terms', ['ai.google.dev']);
const KEY_HELP_URL = safeExternalUrl('https://aistudio.google.com/apikey', ['aistudio.google.com']);

export interface AiPanelProps {
  client: GeminiClient;
  /** 四碼學期（課綱資料用）。 */
  term?: string;
  termLabel: string;
  syllabi?: SyllabusSource;
  features?: Features;
  planner: PlannerState;
  catalog: ReadonlyMap<string, ScheduleCourse>;
  courses: readonly Course[];
  ready: boolean;
  onApply: (changes: Change[], label: string, replaceOldestAutoBackup?: boolean) => AiApplyResult;
  /** 打開時先給的今日重點（本機算出，不呼叫 AI）。 */
  briefing?: Briefing;
  /** 回覆卡上的「看課表」。 */
  onShowTimetable?: () => void;
  /** 回覆卡上的「復原」：只在這次修改還能復原時出現（undoLabel 與這次的標籤相同）。 */
  onUndo?: () => void;
  undoLabel?: string | null;
  /** 從任何地方復原時（底部提示或卡片）App 會更新這個值，讓對應的回覆卡標成已復原。 */
  undone?: { label: string; count: number } | null;
  /** 面板是否打開；收起時清掉貼了但還沒存的金鑰。 */
  visible?: boolean;
}

type Outcome =
  | { kind: 'applied'; demo: boolean; answer: string; added: string[]; removed: string[]; corrections: CourseCorrection[]; backups: number; label: string }
  | { kind: 'answered'; answer: string }
  | { kind: 'rejected'; answer: string; reasons: string[] }
  | { kind: 'confirm'; answer: string; changes: Change[]; label: string; corrections: CourseCorrection[]; demo: boolean; replace: number }
  | { kind: 'failed'; message: string };
type Message = { id: number; from: 'you'; text: string } | { id: number; from: 'buddy'; outcome: Outcome; undone?: boolean; resolved?: boolean };
type Mode = 'plan' | 'qa' | 'career' | 'screenshot';

const MODES: { id: Mode; label: string; Icon: typeof Sparkles }[] = [
  { id: 'plan', label: '排課', Icon: Sparkles },
  { id: 'qa', label: '問課綱', Icon: BookOpenText },
  { id: 'career', label: '職涯', Icon: Compass },
  { id: 'screenshot', label: '截圖', Icon: ImageUp },
];
const action = 'btn btn-sm min-h-11 gap-1.5';

/**
 * 小山的對話面板（2026-11-01 使用者反映舊版「好難用」後改版）：
 * 上方一排模式（排課／問課綱／職涯／截圖），中間是對話紀錄，底部一個輸入框；
 * 年齡確認與金鑰不再擋在最上面，第一次真的要用 AI 時才在對話裡問，設定好就把剛才那句送出。
 */
export function AiPanel({ client, term = '', termLabel, syllabi = httpSyllabusSource, features = FEATURES, planner, catalog, courses, ready, onApply, briefing, onShowTimetable, onUndo, undoLabel, undone, visible = true }: AiPanelProps) {
  const [accepted, setAccepted] = useState(false);
  const [hasKey, setHasKey] = useState(() => client.hasKey());
  const [keyError, setKeyError] = useState('');
  const keyInput = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(false);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const pending = useRef<string | null>(null);
  const nextId = useRef(1);
  const [mode, setMode] = useState<Mode>('plan');
  const thread = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const ageBox = useRef<HTMLInputElement>(null);
  const [announce, setAnnounce] = useState('');
  // 面板被重建（清除本機資料）後，還在路上的回覆一律丟掉，不能再寫進剛清空的資料。
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const titleOf = (key: string) => catalog.get(key)?.title ?? key;
  const knownCodes = new Set(courses.map(({ code }) => code));
  const aiReady = accepted && hasKey;
  // 小山跟著請求走：送出時思考、回覆到了講一下，再依結果開心、點頭、看著確認按鈕或擔心。
  const buddy = useBuddyHub();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const waiting = useRef(false);
  waiting.current = busy;
  // 清除本機資料會重建這個面板：還在等回覆就讓小山別一直想下去。
  useEffect(() => () => { if (waiting.current) buddy?.aiCancel(); }, [buddy]);
  useEffect(() => {
    const box = thread.current;
    if (box && typeof box.scrollTo === 'function') box.scrollTo({ top: box.scrollHeight });
  }, [messages, setupOpen, accepted, busy, mode]);
  // 設定步驟換了就把焦點放到下一步，鍵盤與報讀器使用者不會掉出面板。
  useEffect(() => {
    if (!setupOpen || (accepted && hasKey)) return;
    (accepted ? keyInput.current : ageBox.current)?.focus();
  }, [setupOpen, accepted, hasKey]);
  useEffect(() => {
    if (!visible && keyInput.current) keyInput.current.value = '';
  }, [visible]);

  const modes = MODES.filter(({ id }) => (id === 'plan' ? features.orb || features.demo : id === 'qa' ? features.qa && ready && Boolean(term) : features[id]));
  const say = (from: 'you', text: string) => setMessages((list) => [...list, { id: nextId.current++, from, text }]);
  const reply = (outcome: Outcome) => {
    setMode('plan');
    setMessages((list) => [...list, { id: nextId.current++, from: 'buddy', outcome }]);
    setAnnounce(outcome.kind === 'failed' ? outcome.message
      : outcome.kind === 'applied' ? `已${outcome.added.length ? `加入 ${outcome.added.length} 門課` : '修改課表'}，可以看課表或復原。`
      : outcome.kind === 'rejected' ? '沒有修改課表，原因寫在回覆裡。'
      : outcome.kind === 'confirm' ? '需要你確認才會套用。'
      : '小山回覆了。');
  };

  const finish = (result: AiApplyResult, answer: string, corrections: CourseCorrection[], changes: Change[], label: string, demo: boolean) => {
    buddy?.aiResult(
      result.status === 'applied' ? 'applied' : result.status === 'needsConfirmation' ? 'confirm' : 'rejected',
      answer.length,
      () => confirmButton.current?.getBoundingClientRect(),
    );
    if (result.status === 'applied') {
      reply({ kind: 'applied', demo, answer, added: result.diff.added, removed: result.diff.removed, corrections, backups: result.autoBackupPlanIds.length, label });
    } else if (result.status === 'needsConfirmation') {
      reply({ kind: 'confirm', answer, changes, label, corrections, demo, replace: result.replace });
    } else {
      reply({ kind: 'rejected', answer, reasons: result.violations.map(({ message }) => message) });
    }
  };

  const send = async (text: string) => {
    if (!text || busy) return;
    setBusy(true);
    setAnnounce('小山想一下…');
    buddy?.aiStart();
    const plan = await planWithAi({ client, request: text, termLabel, planner, catalog, courses });
    if (!alive.current) return;
    setBusy(false);
    if (plan.status === 'failed') {
      buddy?.aiResult('failed', 0);
      setHasKey(client.hasKey());
      reply({ kind: 'failed', message: plan.message });
      return;
    }
    if (!plan.changes.length) {
      const answer = plan.answer || 'AI 沒有修改課表。';
      buddy?.aiResult('answered', answer.length);
      reply({ kind: 'answered', answer });
      return;
    }
    const label = 'AI 已修改課表';
    finish(onApply(plan.changes, label), plan.answer, plan.corrections, plan.changes, label, false);
  };

  const submit = () => {
    const text = request.trim();
    if (!text || busy || !ready || (setupOpen && !aiReady)) return;
    say('you', text);
    setRequest('');
    if (!aiReady) {
      // 還沒設定：先記住這句，在對話裡問年齡與金鑰，設定好再自動送出（只記這一句）。
      pending.current = text;
      setSetupOpen(true);
      setAnnounce('先設定 AI，設定好會自動送出剛才那句。');
      return;
    }
    void send(text);
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
      setSetupOpen(false);
      setTimeout(() => composer.current?.focus(), 0);
    } catch {
      input.value = '';
      setKeyError('這不像 Gemini 金鑰：請從 Google AI Studio 複製完整的金鑰再貼上。');
    }
  };
  // 設定完成（同意＋金鑰，不論哪個先好）就送出等著的那一句；只在這裡送，送完就清掉。
  useEffect(() => {
    if (!aiReady || !pending.current) return;
    const text = pending.current;
    pending.current = null;
    setSetupOpen(false);
    setMode('plan');
    void send(text);
    // 只在「剛設定好」時跑一次（send 每次渲染都是新函式，不放進依賴）。
  }, [aiReady]);
  const chooseMode = (next: Mode) => {
    // 換到別的模式就不再自動送出排課那句，也不再盯著確認按鈕。
    pending.current = null;
    buddy?.aiConfirmDone();
    setMode(next);
  };
  const removeKey = () => {
    pending.current = null;
    client.removeKey();
    setHasKey(false);
  };

  // 示範：不呼叫 AI，播放一份預先寫好的變更方案（從本學期快照挑一門不衝堂的通識），一樣可以復原。
  const demo = () => {
    if (busy) return;
    setMode('plan');
    say('you', '看示範');
    const scheduled = new Set(planner.plans.find(({ id }) => id === planner.activePlanId)?.items.map(({ key }) => key));
    const pick = aiSearch(courses, '通識').map((course) => toScheduleCourse(course).key).find((key) => catalog.has(key) && !scheduled.has(key));
    if (!pick) {
      reply({ kind: 'answered', answer: '示範：這學期的資料裡找不到可以示範的課。' });
      return;
    }
    const changes: Change[] = [{ type: 'addToSchedule', key: pick }];
    const answer = `（示範）我幫你加了「${titleOf(pick)}」。真正使用時，AI 會照你的需求搜課與排課。`;
    finish(onApply(changes, '示範：AI 已修改課表'), answer, [], changes, '示範：AI 已修改課表', true);
  };

  const lastApplied = [...messages].reverse().find((message) => message.from === 'buddy' && message.outcome.kind === 'applied');
  const latestConfirm = [...messages].reverse().find((message) => message.from === 'buddy' && message.outcome.kind === 'confirm' && !message.resolved);
  const markUndone = (match: (message: Message) => boolean) =>
    setMessages((list) => list.map((message) => (message.from === 'buddy' && match(message) ? { ...message, undone: true } : message)));
  const undo = (id: number) => {
    markUndone((message) => message.id === id);
    onUndo?.();
  };
  // 從底部提示復原時，把最新一則已套用、標籤相同的回覆標成已復原。
  useEffect(() => {
    if (!undone) return;
    setMessages((list) => {
      const target = [...list].reverse().find((message) => message.from === 'buddy' && message.outcome.kind === 'applied');
      return list.map((message) => (message === target && message.from === 'buddy' && message.outcome.kind === 'applied' && message.outcome.label === undone.label ? { ...message, undone: true } : message));
    });
  }, [undone]);

  const setupCard = (
    <div className="flex items-start gap-2">
      <Xiaoshan size={32} mood="idle" />
      <div className="raised min-w-0 flex-1 space-y-2 rounded-2xl rounded-tl-sm px-3 py-2">
        {!accepted ? (
          <>
            <p className="font-medium">用 AI 之前先確認一下：</p>
            <label className="flex items-start gap-2">
              <input ref={ageBox} type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>
                我已年滿 18 歲，並讀過 <a className="link" href={GEMINI_TERMS_URL} target="_blank" rel="noopener noreferrer">Gemini API 條款</a>
                。送出的需求與必要的課程資料會交給 Google 處理；免費額度的內容可能被用來改進 Google 產品，請不要寫入個資。
              </span>
            </label>
          </>
        ) : (
          // 不用 <form> 與密碼欄位：瀏覽器會把「送出後消失的密碼表單」當成登入、提議儲存，金鑰就會被長期存下來。
          <div role="group" aria-label="金鑰設定" className="space-y-2">
            <p>
              貼上你自己的 Gemini 金鑰（免費申請：<a className="link" href={KEY_HELP_URL} target="_blank" rel="noopener noreferrer">Google AI Studio</a>
              ，說明見<a className="link" href="/privacy#gemini">隱私說明</a>）。金鑰只放在這個分頁的記憶體，重新整理就要重貼。
            </p>
            <label className="input input-sm min-h-11 w-full">
              <KeyRound className="size-4" aria-hidden="true" />
              <span className="sr-only">Gemini 金鑰</span>
              <input
                ref={keyInput}
                type="text"
                className="key-mask"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore=""
                data-lpignore="true"
                data-form-type="other"
                placeholder="貼上 Gemini 金鑰"
                onKeyDown={(event) => { if (event.key === 'Enter') saveKey(); }}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="checkbox checkbox-sm" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              這個分頁記住金鑰（關掉分頁就清除）
            </label>
            {keyError && <p role="alert" className="text-coral-ink">{keyError}</p>}
            <button type="button" className={`${action} btn-primary`} onClick={saveKey}>使用這把金鑰</button>
          </div>
        )}
      </div>
    </div>
  );

  const bubble = (message: Message) => {
    if (message.from === 'you') {
      return (
        <div key={message.id} className="flex justify-end">
          <p className="well max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 whitespace-pre-wrap text-mist-ink">{message.text}</p>
        </div>
      );
    }
    const { outcome } = message;
    if (outcome.kind === 'failed') return <p key={message.id} role="alert" className="text-coral-ink">{outcome.message}</p>;
    return (
      <div key={message.id} className="flex items-start gap-2">
        <Xiaoshan size={32} mood={outcome.kind === 'rejected' ? 'worried' : outcome.kind === 'applied' ? 'happy' : 'idle'} />
        <div className="raised min-w-0 flex-1 space-y-2 rounded-2xl rounded-tl-sm px-3 py-2">
          {outcome.kind === 'applied' && (
            <p className="font-medium">
              {outcome.demo && <span className="chip mr-1">示範</span>}
              已幫你{[
                outcome.added.length ? `加入 ${outcome.added.length} 門課` : '',
                outcome.removed.length ? `移出 ${outcome.removed.length} 門課` : '',
              ].filter(Boolean).join('、') || '修改課表'}
              。{outcome.backups > 0 && `改動前的課表已另存成自動備案。`}
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
          {outcome.kind === 'confirm' && (message.resolved ? <p className="text-xs text-base-content/75">已處理。</p> : (
            <div className="space-y-2">
              <p>改動前要另存自動備案，但自動備案已滿。要刪掉最舊的 {outcome.replace} 份再套用嗎？</p>
              <button
                {...(message === latestConfirm ? { ref: confirmButton } : {})}
                type="button"
                className={action}
                onClick={() => {
                  // 先標成已處理，按鈕就不能再按第二次（不然會多刪備案、蓋掉復原點）。
                  setMessages((list) => list.map((item) => (item.id === message.id ? { ...item, resolved: true } : item)));
                  buddy?.aiConfirmDone();
                  finish(onApply(outcome.changes, outcome.label, true), outcome.answer, outcome.corrections, outcome.changes, outcome.label, outcome.demo);
                }}
              >
                刪掉最舊的 {outcome.replace} 份並套用
              </button>
            </div>
          ))}
          {outcome.answer && <AnswerText text={outcome.answer} knownCodes={knownCodes} />}
          {outcome.kind === 'applied' && (
            message.undone ? <p className="text-xs text-base-content/75">已復原這次修改。</p> : (
              <div className="flex flex-wrap gap-1.5">
                {onShowTimetable && (
                  <button type="button" className={action} onClick={onShowTimetable}><CalendarDays className="size-4" aria-hidden="true" />看課表</button>
                )}
                {onUndo && message === lastApplied && undoLabel === outcome.label && !message.undone && (
                  <button type="button" className={action} onClick={() => undo(message.id)}><Undo2 className="size-4" aria-hidden="true" />復原</button>
                )}
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  const needsAi = mode === 'career' || mode === 'screenshot';
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-sm">
      {modes.length > 1 && (
        <div role="group" aria-label="小山能幫的事" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {modes.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-pressed={mode === id} disabled={busy} className={`btn btn-sm min-h-11 shrink-0 gap-1.5 ${mode === id ? 'tab-selected' : ''}`} onClick={() => chooseMode(id)}>
              <Icon className="size-4" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      )}

      <div ref={thread} className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-1">
        {mode === 'plan' && (
          <>
            {briefing && (
              // 今日重點（參考 Claude Duet）：小山先開口，附幾個一鍵帶入的問題。
              <div className="duet-rings relative overflow-hidden rounded-2xl p-3">
                <div className="flex items-start gap-2">
                  <Xiaoshan size={32} mood={briefing.mood} />
                  <div className="raised rounded-2xl rounded-tl-sm px-3 py-2">
                    <p className="font-bold">嗨！幫你看了一下課表：</p>
                    <ul className="mt-1 space-y-0.5">{briefing.lines.map((line) => <li key={line}>{line}</li>)}</ul>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 pl-10" role="group" aria-label="可以這樣問">
                  {briefing.suggestions.map((suggestion) => (
                    <button key={suggestion} type="button" className="btn btn-sm min-h-11 text-xs" onClick={() => { setRequest(suggestion); composer.current?.focus(); }}>
                      {suggestion}
                    </button>
                  ))}
                  {features.demo && !hasKey && (
                    <button type="button" className="btn btn-sm min-h-11 text-xs" onClick={demo} disabled={!ready || busy}>看示範</button>
                  )}
                </div>
              </div>
            )}
            {!briefing && features.demo && !hasKey && (
              <button type="button" className={action} onClick={demo} disabled={!ready || busy}>看示範</button>
            )}
            <div className="space-y-3">{messages.map(bubble)}</div>
            {busy && (
              <div className="flex items-center gap-2 text-base-content/75">
                <Xiaoshan size={32} mood="thinking" />小山想一下…
              </div>
            )}
            {setupOpen && !aiReady && setupCard}
          </>
        )}
        {mode === 'qa' && ready && term && <QaSection source={syllabi} term={term} courses={courses} client={client} aiReady={aiReady} />}
        {needsAi && !aiReady && setupCard}
        {mode === 'career' && aiReady && ready && (
          <CareerSection client={client} termLabel={termLabel} courses={courses} candidateKeys={new Set(planner.candidates)} onAddCandidates={(changes, label) => { onApply(changes, label); }} />
        )}
        {mode === 'screenshot' && aiReady && ready && (
          <ScreenshotImport client={client} termLabel={termLabel} planner={planner} courses={courses} onAddCandidates={(changes, label) => { onApply(changes, label); }} />
        )}
      </div>

      {mode === 'plan' && features.orb && (
        <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">想怎麼排</span>
            <textarea
              ref={composer}
              className="textarea min-h-11 w-full resize-none py-2.5"
              rows={2}
              value={request}
              maxLength={1000}
              placeholder="想怎麼排？例如：加一門週三下午的通識，不要早八"
              onChange={(event) => setRequest(event.target.value)}
              onKeyDown={(event) => {
                // Enter 送出、Shift＋Enter 換行；注音選字中的 Enter 不算。
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
              }}
            />
          </label>
          <button type="submit" className="btn btn-primary min-h-11 gap-1.5" disabled={!ready || busy || !request.trim() || (setupOpen && !aiReady)}>
            <Send className="size-4" aria-hidden="true" />{busy ? 'AI 處理中…' : '送出'}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/75">
        {aiReady ? (
          <button type="button" className="btn btn-ghost btn-sm min-h-11 gap-1.5" disabled={busy} onClick={removeKey}>
            <Trash2 className="size-4" aria-hidden="true" />移除金鑰
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm min-h-11 gap-1.5" onClick={() => { chooseMode('plan'); setSetupOpen(true); }}>
            <KeyRound className="size-4" aria-hidden="true" />設定 AI
          </button>
        )}
        <span>{setupOpen && !aiReady ? '先完成上面的設定，設定好會自動送出剛才那句。' : '衝堂、鎖定課與學分會先檢查，做錯可以復原。'}</span>
      </div>
      <p role="status" className="sr-only">{announce}</p>
    </div>
  );
}
