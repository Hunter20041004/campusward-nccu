import {
  buildFillPlans,
  candidateScheduleSummary,
  swapFillCourse,
  type ClassName,
  type FillContext,
  type FillPlan,
  type FillSource,
  type ScheduleCourse,
} from '@campusward/engine';
import { Check, Shuffle, TriangleAlert, WandSparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { outcomeMessage, type ChangeOutcome } from './ChangeOutcome.ts';
import { DAY_LABELS, formatCredits } from './labels.ts';

export interface FillPlannerProps {
  context: FillContext;
  className: ClassName | null;
  candidateKeys: readonly string[];
  /** 目前方案的學分。 */
  credits: number;
  limits: { minimum: number; maximum: number } | null;
  catalog: ReadonlyMap<string, ScheduleCourse>;
  /** 挑一份當目前方案，其餘另存成備案（一筆可復原的修改）；回報有沒有真的套用（自動備案滿了要等確認視窗）。 */
  onApply: (chosen: FillPlan, others: FillPlan[], target: number) => ChangeOutcome | Promise<ChangeOutcome>;
}

const SOURCE_LABELS: Record<FillSource, string> = { required: '本班必修', candidate: '候選', department: '本系選修', general: '通識' };
const LETTERS = ['A', 'B', 'C'];
const TARGETS = [12, 15, 18, 20, 22, 25];

/** 目標學分的選項：在依身分的上下限之內、而且比現在多。 */
export function targetOptions(credits: number, limits: { minimum: number; maximum: number } | null): number[] {
  const minimum = limits?.minimum ?? 9;
  const maximum = limits?.maximum ?? 25;
  return TARGETS.filter((value) => value >= minimum && value <= maximum && value > credits);
}

/**
 * 「幫我排滿」（2026-11-01 易用性審查第 5 名，使用者核可）：選目標學分，本機排出 2–3 份完整方案並排比較；
 * 偏好（空堂日、不要早八）、本班必修、候選都沿用，不用金鑰、不送任何資料出去。
 */
export function FillPlanner({ context, className, candidateKeys, credits, limits, catalog, onApply }: FillPlannerProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  // 每份方案「換一門」換掉過的課，換掉就不再換回來。
  const [swaps, setSwaps] = useState<Record<string, { plan: FillPlan; exclude: string[] }>>({});
  const options = targetOptions(credits, limits);
  const request = useMemo(() => (target === null ? null : { className, candidateKeys, target }), [candidateKeys, className, target]);
  const result = useMemo(() => (request ? buildFillPlans(context, request) : null), [context, request]);
  // 課表或偏好變了就重排：之前換過的課可能已經不適合。
  useEffect(() => setSwaps({}), [result]);
  const plans = result?.plans.map((plan) => swaps[plan.id]?.plan ?? plan) ?? [];
  const [message, setMessage] = useState('');

  const choose = (value: number) => {
    setTarget(value);
    setSwaps({});
    setMessage('');
  };
  const swap = (plan: FillPlan, key: string) => {
    if (!request) return;
    const exclude = [...(swaps[plan.id]?.exclude ?? []), key];
    const next = swapFillCourse(context, request, plan, key, exclude);
    if (!next) {
      setMessage(`「${catalog.get(key)?.title ?? '這門課'}」找不到別門排得進去的課可以換。`);
      return;
    }
    setMessage('');
    setSwaps((previous) => ({ ...previous, [plan.id]: { plan: next, exclude } }));
  };
  // 打開時焦點移到標題；收起或套用後回到「幫我排滿」按鈕（按鈕本身會消失，焦點不能掉回整頁開頭）。
  const title = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (open) title.current?.focus();
    else if (returnFocus.current) trigger.current?.focus();
    returnFocus.current = false;
  }, [open]);
  const close = () => {
    returnFocus.current = true;
    setOpen(false);
    setTarget(null);
    setSwaps({});
    setMessage('');
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button ref={trigger} type="button" className="btn btn-sm min-h-11 gap-1.5" onClick={() => setOpen(true)}>
          <WandSparkles className="size-4" aria-hidden="true" />幫我排滿
        </button>
        <span className="text-xs text-base-content/75">選想修幾學分，在這台裝置排出 2–3 份方案比較，不用金鑰</span>
      </div>
    );
  }

  const unplaced = result?.required.unplaced ?? [];
  const titleOf = (key: string) => catalog.get(key)?.title ?? '課程';
  // 本班必修沒排進去的原因：衝堂、超過學分上限、課表上已有同名的課（別系開的，不自動再排一門）。
  const count = (reason: string) => unplaced.filter((item) => item.reason === reason).length;
  const unplacedNotes = [
    count('clash') ? `有 ${count('clash')} 門本班必修每一班都衝堂，沒有排進去；可以在「我的系級」那裡自己選班。` : '',
    count('max') ? `有 ${count('max')} 門本班必修排進去會超過學分上限（${context.maximumCredits ?? ''} 學分），沒有排進去。` : '',
    ...unplaced.filter(({ reason }) => reason === 'same').map(({ clashesWith }) => (
      `課表上已有「${clashesWith.map(titleOf).join('」「')}」，和本班必修同名或同科目，沒有重複排；要換成本班那一班，可以在「我的系級」那裡排。`
    )),
  ].filter(Boolean);
  return (
    <section aria-labelledby="fill-title" className="well space-y-3 rounded-2xl p-3 text-sm">
      <div className="flex items-start gap-2">
        <h3 ref={title} id="fill-title" tabIndex={-1} className="flex flex-1 items-center gap-1.5 text-base font-bold text-mist-ink">
          <WandSparkles className="size-4" aria-hidden="true" />幫我排滿
        </h3>
        <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="收起幫我排滿" onClick={close}>
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {options.length === 0 ? (
        <p>目前 {credits} 學分，已經到上限了。</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span id="fill-target-label">想排到幾學分？</span>
          <div role="radiogroup" aria-labelledby="fill-target-label" className="flex flex-wrap gap-1">
            {options.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={target === value}
                className={`btn btn-sm min-h-11 min-w-11 px-2.5 tabular ${target === value ? 'tab-selected text-mist-ink' : ''}`}
                onClick={() => choose(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-base-content/75">
        本班必修、課表上已有的課都保留；再從候選（同課名任一班）、本系選修、通識補，避開衝堂、空堂日與早八，同名只排一門，也照初選分發科目數上限。
      </p>
      {unplacedNotes.map((note) => (
        <p key={note} className="flex items-start gap-1.5 text-coral-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {note}
        </p>
      ))}
      <p role="status" className="empty:hidden">{message}</p>
      {request && (
        plans.length === 0 ? <p>找不到可以補的課。</p> : (
          // 手機左右滑動看各份方案；桌機並排成欄。
          <ul aria-label="排好的方案" className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))] sm:overflow-visible">
            {plans.map((plan, index) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                letter={LETTERS[index] ?? String(index + 1)}
                credits={credits}
                target={request.target}
                catalog={catalog}
                entries={context.entries}
                onSwap={(key) => swap(plan, key)}
                onChoose={async () => {
                  // 真的套用了才收起；被拒絕或在確認視窗按取消，方案（含換過的課）都留著，並說明原因。
                  const outcome = await onApply(plan, plans.filter((other) => other !== plan), request.target);
                  if (outcome.status === 'applied') close();
                  else setMessage(outcomeMessage(outcome));
                }}
                titleOf={titleOf}
              />
            ))}
          </ul>
        )
      )}
    </section>
  );
}

function PlanCard({ plan, letter, credits, target, catalog, entries, onSwap, onChoose, titleOf }: {
  plan: FillPlan;
  letter: string;
  credits: number;
  target: number;
  catalog: ReadonlyMap<string, ScheduleCourse>;
  entries: FillContext['entries'];
  onSwap: (key: string) => void;
  onChoose: () => void;
  titleOf: (key: string) => string;
}) {
  const name = `方案 ${letter}・${plan.label}`;
  const courses = plan.picks.flatMap((pick) => {
    const course = catalog.get(pick.key);
    return course ? [{ pick, course }] : [];
  });
  const days = new Set([...entries.map(({ course }) => course), ...courses.map(({ course }) => course)].flatMap(({ meetings }) => meetings.map(({ day }) => day)));
  const free = [1, 2, 3, 4, 5].filter((day) => !days.has(day)).map((day) => DAY_LABELS[day]);
  return (
    <li className="raised flex w-[17rem] shrink-0 snap-start flex-col gap-2 rounded-2xl p-3 sm:w-auto">
      <div>
        <h4 className="font-bold">{name}</h4>
        <p className="text-xs text-base-content/75">{plan.description}</p>
      </div>
      <p>
        共 <strong className="tabular">{plan.credits}</strong> 學分
        <span className="text-xs text-base-content/75">（加 {plan.picks.length} 門{credits > 0 ? `、多 ${formatCredits(plan.credits - credits)}` : ''}）</span>
        {!plan.reached && <span className="block text-xs text-coral-ink">離 {target} 學分還差 {target - plan.credits}：排得進去的課不夠，可以先收藏想修的課到候選</span>}
        <span className="block text-xs text-base-content/75">{free.length ? `${free.join('、')}沒課` : '週一到週五都有課'}</span>
      </p>
      <ul aria-label={`${name}的課`} className="flex-1 space-y-1">
        {courses.map(({ pick, course }) => (
          <li key={pick.key} className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1">
              <span className="chip mr-1 text-xs">{pick.source === 'general' ? course.official?.generalEducation || '通識' : SOURCE_LABELS[pick.source]}</span>
              {course.title}
              <span className="tabular block text-xs text-base-content/75">{candidateScheduleSummary(course, DAY_LABELS)}・{formatCredits(course.credits)}</span>
            </span>
            {pick.source !== 'required' && (
              <button type="button" className="btn btn-ghost btn-sm min-h-11 shrink-0 gap-1 px-2 text-xs" aria-label={`換一門：${titleOf(pick.key)}`} onClick={() => onSwap(pick.key)}>
                <Shuffle className="size-4" aria-hidden="true" />換一門
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary btn-sm min-h-11 gap-1" onClick={onChoose} aria-label={`用這份：${name}`}>
        <Check className="size-4" aria-hidden="true" />用這份
      </button>
    </li>
  );
}
