import { Plus } from 'lucide-react';

export function PlanBar({ credits }: { credits: number }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <button type="button" className="btn btn-sm min-h-11 rounded-selector border-primary bg-primary/15 text-mist-ink" aria-pressed="true">主方案</button>
      <button type="button" className="btn btn-sm btn-ghost min-h-11 gap-1 rounded-selector border border-base-300" aria-label="另存為新備案">
        <Plus className="size-4" aria-hidden="true" />
        備案
      </button>
      <span className="ml-auto shrink-0 text-sm">
        共 <strong className="tabular font-semibold">{credits}</strong> 學分
      </span>
    </div>
  );
}
