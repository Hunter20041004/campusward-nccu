import { CalendarDays, Search } from 'lucide-react';
import { OrbMark } from './OrbMark.tsx';

export type MobileView = 'timetable' | 'search' | 'ai';

export function MobileNav({ view, onView }: { view: MobileView; onView: (view: MobileView) => void }) {
  const items: { id: MobileView; label: string; icon: React.ReactNode }[] = [
    { id: 'timetable', label: '課表', icon: <CalendarDays className="size-5" aria-hidden="true" /> },
    { id: 'search', label: '搜課', icon: <Search className="size-5" aria-hidden="true" /> },
    { id: 'ai', label: 'AI', icon: <OrbMark size={20} /> },
  ];
  return (
    <nav aria-label="主要分頁" className="fixed inset-x-0 bottom-0 z-20 border-t border-base-300 bg-base-100/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
      <ul className="grid grid-cols-3">
        {items.map(({ id, label, icon }) => (
          <li key={id}>
            <button
              type="button"
              aria-current={view === id ? 'page' : undefined}
              onClick={() => onView(id)}
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium ${view === id ? 'text-mist-ink' : 'text-base-content/75'}`}
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
