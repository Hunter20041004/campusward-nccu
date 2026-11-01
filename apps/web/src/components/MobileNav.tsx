import { CalendarDays, Ellipsis, Search } from 'lucide-react';
import { useState } from 'react';
import { TOOLS, type Tool } from './ToolRail.tsx';

export type MobileView = 'timetable' | Tool;

/** 手機底部分頁：搜課、課表，其他工具收在「更多」；小山（AI 小助手）是浮在右下角的按鈕。 */
export function MobileNav({ view, tools, onView, onMenu }: { view: MobileView; tools: readonly Tool[]; onView: (view: MobileView) => void; /** 「更多」選單開關：讓小山的提醒泡泡先讓開。 */ onMenu?: (open: boolean) => void }) {
  const [more, setMoreState] = useState(false);
  const setMore = (open: boolean) => {
    setMoreState(open);
    onMenu?.(open);
  };
  const others = TOOLS.filter(({ id }) => id !== 'search' && tools.includes(id));
  const items: { id: MobileView; label: string; icon: React.ReactNode }[] = [
    { id: 'search', label: '搜課', icon: <Search className="size-5" aria-hidden="true" /> },
    { id: 'timetable', label: '課表', icon: <CalendarDays className="size-5" aria-hidden="true" /> },
  ];
  const choose = (next: MobileView) => {
    setMore(false);
    onView(next);
  };
  return (
    <nav aria-label="主要分頁" className="fixed inset-x-0 bottom-0 z-20 bg-base-100/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_16px_-10px_rgb(0_0_0/0.25)] backdrop-blur-sm md:hidden">
      {more && (
        <ul aria-label="更多工具" className="relief mb-2 ml-3 mr-24 flex flex-col gap-1 p-2">
          {others.map(({ id, label, icon }) => (
            <li key={id}>
              <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold" onClick={() => choose(id)}>
                {icon}{label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="grid grid-cols-3">
        {[...items, { id: 'more' as const, label: '更多', icon: <Ellipsis className="size-5" aria-hidden="true" /> }].map(({ id, label, icon }) => (
          <li key={id}>
            <button
              type="button"
              aria-current={id !== 'more' && view === id ? 'page' : undefined}
              aria-expanded={id === 'more' ? more : undefined}
              onClick={() => (id === 'more' ? setMore(!more) : choose(id))}
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-bold ${
                (id === 'more' ? more || others.some((tool) => tool.id === view) : view === id) ? 'text-mist-ink' : 'text-base-content/75'
              }`}
            >
              {icon}
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
