import { comparePlans, type Plan, type ScheduleCourse } from '@campusward/engine';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlanBarProps {
  plans: readonly Plan[];
  activePlanId: string;
  credits: number;
  catalog: ReadonlyMap<string, ScheduleCourse>;
  onSwitch: (planId: string) => void;
  onCreate: () => void;
  /** 依身分的學分上下限（選課須知）；有就顯示在學分數旁。 */
  limits?: { minimum: number; maximum: number } | null;
  /** 還沒設定年級時提供：按了去「條件 → 我的身分」。 */
  onSetIdentity?: () => void;
}

function creditRangeNote(credits: number, { minimum, maximum }: { minimum: number; maximum: number }) {
  if (credits < minimum) return `低於學分下限 ${minimum} 學分`;
  if (credits > maximum) return `超過學分上限 ${maximum} 學分`;
  return `學分下限 ${minimum}、上限 ${maximum}`;
}

const MAX_TITLES = 3;

/**
 * 自動比較的對象（2026-11-01 易用性審查第 11 名）：看備案時和主方案（第一個自己的方案）比；
 * 正在看主方案時和上一個看過的方案比，沒看過就和最新的一份自己的備案比。
 */
function autoCompareId(plans: readonly Plan[], activePlanId: string, previous: string | null): string {
  const main = plans.find(({ auto }) => !auto) ?? plans[0];
  if (main && main.id !== activePlanId) return main.id;
  const others = plans.filter(({ id }) => id !== activePlanId);
  if (previous && others.some(({ id }) => id === previous)) return previous;
  return (others.filter(({ auto }) => !auto).at(-1) ?? others.at(-1))?.id ?? '';
}

export function PlanBar({ plans, activePlanId, credits, catalog, onSwitch, onCreate, limits, onSetIdentity }: PlanBarProps) {
  // 記住上一個看過的方案；學生自己選的比較對象只對當下這個方案有效，換方案就回到自動。
  const [seen, setSeen] = useState<{ current: string; previous: string | null }>({ current: activePlanId, previous: null });
  if (seen.current !== activePlanId) setSeen({ current: activePlanId, previous: seen.current });
  const [chosen, setChosen] = useState<{ active: string; id: string } | null>(null);
  const previous = seen.current === activePlanId ? seen.previous : seen.current;
  const compareId = chosen?.active === activePlanId ? chosen.id : autoCompareId(plans, activePlanId, previous);
  const active = plans.find(({ id }) => id === activePlanId);
  const other = plans.find(({ id }) => id === compareId && id !== activePlanId);
  // comparePlans(other, active)：「多了」是只在目前這份的課，學分寫「比較對象 → 目前這份」。
  const comparison = active && other ? comparePlans(other, active, catalog) : null;
  const titles = (keys: string[]) => {
    const names = keys.slice(0, MAX_TITLES).map((key) => catalog.get(key)?.title ?? key).join('、');
    return keys.length > MAX_TITLES ? `${names} 等 ${keys.length} 門` : names;
  };

  // 方案多到一列放不下時：捲動那一側淡出，看得出還有方案可以左右捲（「＋ 備案」放在捲動區外，永遠看得到）。
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<'none' | 'start' | 'end' | 'both'>('none');
  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const before = element.scrollLeft > 1;
    const after = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setMore(before && after ? 'both' : before ? 'start' : after ? 'end' : 'none');
  }, []);
  useEffect(() => {
    measure();
    const element = scroller.current;
    if (!element) return;
    element.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure, plans.length]);
  // 換到的方案捲進看得到的範圍（例：比較框寫的方案在列尾）；剛載入時不捲，免得頁面跳動。
  const switched = useRef(false);
  useEffect(() => {
    if (!switched.current) { switched.current = true; return; }
    scroller.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activePlanId]);

  return (
    <div className="space-y-2">
      {/* 窄螢幕上方案列至少要 16rem，放不下時學分數換到下一行（不然方案列只剩一顆按鈕寬）。 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div role="group" aria-label="方案" className="flex min-w-0 flex-1 basis-64 items-center gap-1">
        <div ref={scroller} data-plan-scroll="" data-more={more} className="plan-scroll flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
          {plans.map((plan) => {
            const pressed = plan.id === activePlanId;
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onSwitch(plan.id)}
                className={`btn btn-sm min-h-11 shrink-0 gap-1.5 ${pressed ? 'tab-selected text-mist-ink' : ''}`}
              >
                {plan.name}
                {plan.auto && <span className="rounded-full bg-secondary px-2 text-xs font-normal text-secondary-content">自動</span>}
              </button>
            );
          })}
        </div>
          <button type="button" className="btn btn-ghost btn-sm mb-1 min-h-11 shrink-0 gap-1" aria-label="另存為新備案" onClick={onCreate}>
            <Plus className="size-4" aria-hidden="true" />
            備案
          </button>
        </div>
        <span className="shrink-0 text-sm">
          共 <strong className="tabular font-semibold">{credits}</strong> 學分
          {limits && (
            <span
              title={creditRangeNote(credits, limits)}
              className={`tabular ${credits < limits.minimum || credits > limits.maximum ? 'font-bold text-coral-ink' : 'text-base-content/75'}`}
            >
              （{limits.minimum}–{limits.maximum}）
            </span>
          )}
        </span>
      </div>
      {!limits && onSetIdentity && (
        <div className="flex justify-end">
          <button type="button" className="btn btn-ghost btn-sm min-h-11 text-xs font-medium text-mist-ink underline underline-offset-4" onClick={onSetIdentity}>
            設定年級後可檢查學分上下限
          </button>
        </div>
      )}
      {plans.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {comparison && other && (
            <section aria-label="方案比較" className="well flex min-w-0 flex-1 basis-64 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl px-3 py-2">
              <span className="font-bold">和「{other.name}」相比：</span>
              {comparison.onlyInSecond.length === 0 && comparison.onlyInFirst.length === 0 ? (
                <span>課都一樣</span>
              ) : (
                <>
                  {comparison.onlyInSecond.length > 0 && (
                    <span><span aria-hidden="true" className="font-bold text-mist-ink">+</span><span className="sr-only">多了</span>{titles(comparison.onlyInSecond)}</span>
                  )}
                  {comparison.onlyInFirst.length > 0 && (
                    <span><span aria-hidden="true" className="font-bold text-coral-ink">−</span><span className="sr-only">少了</span>{titles(comparison.onlyInFirst)}</span>
                  )}
                </>
              )}
              <span className="tabular">學分 {comparison.firstCredits} → {comparison.secondCredits}（{comparison.creditDifference >= 0 ? '+' : ''}{comparison.creditDifference}）</span>
            </section>
          )}
          <label className="flex items-center gap-2 text-xs">
            <span>與這個方案比較</span>
            <select className="select select-sm min-h-11 w-auto" value={other ? compareId : ''} onChange={(event) => setChosen({ active: activePlanId, id: event.target.value })}>
              <option value="">不比較</option>
              {plans.filter(({ id }) => id !== activePlanId).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
