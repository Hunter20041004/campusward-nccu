import { Sparkles } from 'lucide-react';
import { OrbMark } from './OrbMark.tsx';

export type SideTab = 'search' | 'conditions' | 'ai';

const TABS: { id: SideTab; label: string }[] = [
  { id: 'search', label: '搜課' },
  { id: 'conditions', label: '條件' },
  { id: 'ai', label: 'AI' },
];

export function SidePanel({ tab, onTab, children, conditions }: { tab: SideTab; onTab: (tab: SideTab) => void; children: React.ReactNode; conditions?: React.ReactNode }) {
  return (
    <aside aria-label="側欄" className="relief flex min-h-[28rem] flex-col rounded-box">
      <div role="tablist" aria-label="側欄內容" className="flex gap-1 border-b border-base-300 p-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`side-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`side-panel-${id}`}
            onClick={() => onTab(id)}
            className={`min-h-11 flex-1 rounded-field px-3 text-sm font-medium transition-colors duration-150 ${
              tab === id ? 'bg-primary/15 text-mist-ink' : 'text-base-content/80 hover:bg-base-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`side-panel-${tab}`} aria-labelledby={`side-tab-${tab}`} className="flex min-h-0 flex-1 flex-col p-4">
        {tab === 'search' ? children : tab === 'conditions' ? conditions : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <OrbMark size={56} />
            <p className="font-medium">AI 光球</p>
            <p className="max-w-[28ch] text-sm text-base-content/80">說出需求，AI 直接幫你搜課排課，做錯可以復原。沒有金鑰也能自己搜課排課。</p>
            <span className="inline-flex items-center gap-1 text-xs text-mist-ink">
              <Sparkles className="size-3.5" aria-hidden="true" />
              下一階段接上
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
