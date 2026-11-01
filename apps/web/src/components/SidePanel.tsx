import { Sparkles } from 'lucide-react';
import { OrbMark } from './OrbMark.tsx';

export type SideTab = 'search' | 'conditions' | 'ai';

const TABS: { id: SideTab; label: string }[] = [
  { id: 'search', label: '搜課' },
  { id: 'conditions', label: '條件' },
  { id: 'ai', label: 'AI' },
];

export function SidePanel({ tab, onTab, children, conditions, ai }: { tab: SideTab; onTab: (tab: SideTab) => void; children: React.ReactNode; conditions?: React.ReactNode; ai?: React.ReactNode }) {
  return (
    <aside aria-label="側欄" className="relief flex flex-col rounded-box md:sticky md:top-20 md:h-[calc(100dvh-6.5rem)] md:min-h-[28rem]">
      <div role="tablist" aria-label="側欄內容" className="well m-3 mb-1 flex gap-1 rounded-full p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`side-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`side-panel-${id}`}
            onClick={() => onTab(id)}
            className={`min-h-11 flex-1 rounded-full px-3 text-sm font-bold transition-shadow duration-150 ${
              tab === id ? 'tab-selected text-mist-ink' : 'text-base-content/75 hover:text-base-content'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* 三個分頁都保持掛載，只隱藏沒選的：切分頁不會丟掉 AI 結果、輸入到一半的文字。 */}
      {(['search', 'conditions'] as const).map((id) => (
        <div key={id} role="tabpanel" id={`side-panel-${id}`} aria-labelledby={`side-tab-${id}`} hidden={tab !== id} className="min-h-0 flex-1 flex-col overflow-y-auto p-4 [&:not([hidden])]:flex">
          {id === 'search' ? children : conditions}
        </div>
      ))}
      <div role="tabpanel" id="side-panel-ai" aria-labelledby="side-tab-ai" hidden={tab !== 'ai'} className="min-h-0 flex-1 flex-col overflow-y-auto p-4 [&:not([hidden])]:flex">
        {ai ?? (
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
