import { CircleHelp } from 'lucide-react';
import { OrbMark } from './OrbMark.tsx';

export function Header({ termLabel, onGuide }: { termLabel: string; onGuide: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-base-100/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 md:px-6">
        <a href="/" className="flex min-h-11 shrink-0 items-center gap-2 rounded-field text-xl font-bold tracking-tight text-mist-ink">
          <OrbMark />
          <span>Campusward 排課</span>
        </a>
        <span className="raised shrink-0 rounded-full px-3 py-1 text-sm font-bold tabular">{termLabel}</span>
        <span className="ml-auto hidden text-xs text-mist-ink sm:inline">非政大官方服務</span>
        <button type="button" className="btn btn-ghost min-h-11 min-w-11 px-2" aria-label="使用導覽" title="使用導覽" onClick={onGuide}>
          <CircleHelp className="size-5 text-mist-ink" aria-hidden="true" />
        </button>
      </div>
      <p className="px-4 pb-1 text-center text-xs text-mist-ink sm:hidden">非政大官方服務</p>
    </header>
  );
}
