import { Search } from 'lucide-react';
import type { RefObject } from 'react';
import { OrbMark } from './OrbMark.tsx';

export function Header({ query, onQuery, searchRef, termLabel }: {
  query: string;
  onQuery: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  termLabel: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 md:gap-x-5 md:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2 rounded-field text-[1.0625rem] font-semibold tracking-tight">
          <OrbMark />
          <span>Campusward</span>
        </a>
        <span className="hidden shrink-0 rounded-selector border border-base-300 px-2.5 py-1 text-sm font-medium tabular sm:inline">{termLabel}</span>
        <label className="input input-bordered flex h-11 min-w-0 flex-1 items-center gap-2 bg-base-100 md:max-w-xl">
          <Search className="size-4 shrink-0 text-mist-ink" aria-hidden="true" />
          <span className="sr-only">搜課</span>
          <input
            ref={searchRef}
            type="search"
            className="min-w-0 grow"
            placeholder="課名、教師或課號"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
        <span className="order-last basis-full text-center text-xs text-mist-ink lg:order-none lg:ml-auto lg:basis-auto">非政大官方服務</span>
      </div>
    </header>
  );
}
