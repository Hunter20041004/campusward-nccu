import { comparePlans, type Plan, type ScheduleCourse } from '@campusward/engine';
import { Plus } from 'lucide-react';
import { useState } from 'react';

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

export function PlanBar({ plans, activePlanId, credits, catalog, onSwitch, onCreate, limits, onSetIdentity }: PlanBarProps) {
  const [compareId, setCompareId] = useState('');
  const active = plans.find(({ id }) => id === activePlanId);
  const other = plans.find(({ id }) => id === compareId && id !== activePlanId);
  const comparison = active && other ? comparePlans(active, other, catalog) : null;
  const titles = (keys: string[]) => keys.map((key) => catalog.get(key)?.title ?? key).join('、') || '無';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div role="group" aria-label="方案" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
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
          <button type="button" className="btn btn-ghost btn-sm min-h-11 shrink-0 gap-1" aria-label="另存為新備案" onClick={onCreate}>
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
          <label className="flex items-center gap-2">
            <span>與這個方案比較</span>
            <select className="select select-sm min-h-11 w-auto" value={compareId} onChange={(event) => setCompareId(event.target.value)}>
              <option value="">不比較</option>
              {plans.filter(({ id }) => id !== activePlanId).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          {comparison && active && other && (
            <section aria-label="方案比較" className="well flex flex-wrap gap-x-4 gap-y-1 rounded-2xl px-3 py-2">
              <span>只在{active.name}：{titles(comparison.onlyInFirst)}</span>
              <span>只在{other.name}：{titles(comparison.onlyInSecond)}</span>
              <span className="tabular">學分 {comparison.firstCredits} → {comparison.secondCredits}（{comparison.creditDifference >= 0 ? '+' : ''}{comparison.creditDifference}）</span>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
