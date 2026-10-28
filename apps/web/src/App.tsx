import { useRef, useState } from 'react';
import { Header } from './components/Header.tsx';
import { MobileNav, type MobileView } from './components/MobileNav.tsx';
import { PlanBar } from './components/PlanBar.tsx';
import { SidePanel, type SideTab } from './components/SidePanel.tsx';
import { Timetable } from './components/Timetable.tsx';
import { httpCatalogSource, type CatalogSource } from './data/catalog.ts';
import { useCatalog } from './data/useCatalog.ts';

export function App({ catalog = httpCatalogSource }: { catalog?: CatalogSource }) {
  const data = useCatalog(catalog);
  const [query, setQuery] = useState('');
  const [sideTab, setSideTab] = useState<SideTab>('search');
  const [mobileView, setMobileView] = useState<MobileView>('timetable');
  const searchRef = useRef<HTMLInputElement>(null);

  const handleQuery = (value: string) => {
    setQuery(value);
    setSideTab('search');
    if (value) setMobileView('search');
  };

  const startSearch = () => {
    setSideTab('search');
    searchRef.current?.focus();
  };

  const handleView = (view: MobileView) => {
    setMobileView(view);
    if (view !== 'timetable') setSideTab(view);
  };

  // 手機一次只顯示一個區塊；桌機兩欄同時顯示。
  const mobileOnly = (visible: boolean) => (visible ? '' : 'hidden md:block');

  return (
    <div className="min-h-dvh pb-20 md:pb-8">
      <Header query={query} onQuery={handleQuery} searchRef={searchRef} termLabel={data.status === 'ready' ? data.label : data.status === 'loading' ? '載入中' : '—'} />
      <main data-mobile-view={mobileView} className="mx-auto max-w-[1440px] px-4 pt-4 md:px-6">
        {data.status === 'error' && (
          <p role="alert" className="mb-3 rounded-field border border-coral-ink/40 bg-error/10 px-4 py-3 text-sm text-coral-ink">
            課程資料暫時載入不了，請檢查網路後重新整理。已排的課表仍保存在這台裝置。
          </p>
        )}
        <PlanBar credits={0} />
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className={mobileOnly(mobileView === 'timetable')}>
            <Timetable onStartSearch={startSearch} onImport={() => {}} />
          </div>
          <div className={mobileOnly(mobileView !== 'timetable')}>
            <SidePanel tab={sideTab} onTab={setSideTab} query={query} />
          </div>
        </div>
      </main>
      <MobileNav view={mobileView} onView={handleView} />
    </div>
  );
}
