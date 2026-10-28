import type { Conflict, RuleReminder } from '@campusward/engine';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';

interface Item {
  key: string;
  severity: 'warn' | 'info';
  tag: string;
  message: string;
  source?: string;
}

/** 衝堂與選課規則提醒：只提醒、不阻擋，每則附出處（設計第 5 節）。 */
export function RulesPanel({ conflicts, reminders }: { conflicts: readonly Conflict[]; reminders: readonly RuleReminder[] }) {
  const [open, setOpen] = useState(false);
  const items: Item[] = [
    ...conflicts.map((conflict, index): Item => ({ key: `conflict-${index}`, severity: 'warn', tag: '衝堂', message: conflict.message })),
    ...reminders.map((reminder, index): Item => ({ key: `${reminder.id}-${index}`, severity: reminder.severity, tag: reminder.severity === 'warn' ? '注意' : '提示', message: reminder.message, source: reminder.source })),
  ].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1));
  const warnings = items.filter(({ severity }) => severity === 'warn').length;

  return (
    <section aria-labelledby="rules-heading" className="rounded-box border border-base-300 bg-base-100">
      <h2 id="rules-heading" className="sr-only">提醒</h2>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-base-content/80">目前沒有衝堂或選課規則提醒。</p>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="rules-list"
            onClick={() => setOpen(!open)}
            className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm md:hidden"
          >
            <AlertTriangle className={`size-4 ${warnings ? 'text-coral-ink' : 'text-mist-ink'}`} aria-hidden="true" />
            <span className="flex-1">{items.length} 則提醒，其中 {warnings} 則需要注意</span>
            <ChevronDown className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <div id="rules-list" className={`${open ? '' : 'hidden'} md:block`}>
            <ul aria-label="提醒" className="divide-y divide-base-300">
              {items.map((item) => (
                <li key={item.key} className="flex gap-3 px-4 py-2.5 text-sm">
                  {item.severity === 'warn'
                    ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-coral-ink" aria-hidden="true" />
                    : <Info className="mt-0.5 size-4 shrink-0 text-mist-ink" aria-hidden="true" />}
                  <div className="min-w-0">
                    <p>
                      <span className={`mr-1.5 font-medium ${item.severity === 'warn' ? 'text-coral-ink' : 'text-mist-ink'}`}>{item.tag}</span>
                      {item.message}
                    </p>
                    {item.source && <p className="mt-0.5 text-xs text-base-content/75">出處：{item.source}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-base-300 px-4 py-2 text-xs text-base-content/75">這些規則只提醒，不會擋你排課；實際以學校選課系統為準。</p>
          </div>
        </>
      )}
    </section>
  );
}
