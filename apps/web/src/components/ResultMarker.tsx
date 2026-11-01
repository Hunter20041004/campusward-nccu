import { candidateScheduleSummary, type ScheduleCourse, type ScheduleEntry } from '@campusward/engine';
import { ArrowLeftRight, Check, ClipboardCheck, Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import { SafeLink } from './CourseDetails.tsx';
import { DAY_LABELS } from './labels.ts';

export interface ResultMarkerProps {
  /** 目前方案的課。 */
  entries: readonly ScheduleEntry[];
  catalog: ReadonlyMap<string, ScheduleCourse>;
  /** 沒選上的課的替補（App 用引擎 lostCourseReplacements，對「確定之後」的課表算）。 */
  replacementsFor: (lostKey: string) => { sections: readonly ScheduleCourse[]; sameSlot: readonly ScheduleCourse[] };
  /** 選上的標成已選上並鎖定，沒選上的移出課表（留在候選）；一筆可復原的修改。 */
  onConfirm: (kept: string[], lost: string[]) => void;
  /** 替補：把這門加進課表。 */
  onReplace: (lostKey: string, key: string) => void;
  /** 用空堂找課找那門課原本時段的其他課。 */
  onFindSlot: (lostKey: string) => void;
  /** 官方即時餘額連結（只連過去，本站不抓餘額）。 */
  remainingUrl?: (key: string) => string | undefined;
  /** 打開或收起：讓小山的提醒泡泡先讓開，不蓋住勾選框。 */
  onOpenChange?: (open: boolean) => void;
}

const MAX_SHOWN = 3;
const when = (course: ScheduleCourse) => (course.meetings.length ? candidateScheduleSummary(course, DAY_LABELS) : '時間未定');

/**
 * 「標記選課結果」（2026-11-01 易用性審查第 10 名）：初選結果出來後一個畫面勾完，預設全部選上，
 * 取消勾選沒選上的；沒選上的每一門下面直接列 2–3 個替補（別班、同時段的別門課），點一下就換。全部在本機算。
 */
export function ResultMarker({ entries, catalog, replacementsFor, onConfirm, onReplace, onFindSlot, remainingUrl, onOpenChange }: ResultMarkerProps) {
  const [stage, setStageState] = useState<'closed' | 'marking' | 'replacing'>('closed');
  const setStage = (next: 'closed' | 'marking' | 'replacing') => {
    setStageState(next);
    onOpenChange?.(next !== 'closed');
  };
  const [lostKeys, setLostKeys] = useState<string[]>([]);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const scheduled = new Set(entries.map(({ course }) => course.key));
  const titleOf = (key: string) => catalog.get(key)?.title ?? '課程';

  if (stage === 'closed') {
    if (!entries.length) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm min-h-11 gap-1.5" onClick={() => { setUnticked(new Set()); setMessage(''); setStage('marking'); }}>
          <ClipboardCheck className="size-4" aria-hidden="true" />標記選課結果
        </button>
        <span role="status" className="text-xs text-base-content/75">{message || '初選結果出來後，一次勾完選上哪些，沒上的直接給替補'}</span>
      </div>
    );
  }

  const close = () => setStage('closed');
  const header = (
    <div className="flex items-start gap-2">
      <h3 id="result-title" className="flex flex-1 items-center gap-1.5 text-base font-bold text-mist-ink">
        <ClipboardCheck className="size-4" aria-hidden="true" />標記選課結果
      </h3>
      <button type="button" className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2" aria-label="收起標記選課結果" onClick={close}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );

  if (stage === 'marking') {
    const kept = entries.map(({ course }) => course.key).filter((key) => !unticked.has(key));
    const lost = entries.map(({ course }) => course.key).filter((key) => unticked.has(key));
    const confirm = () => {
      onConfirm(kept, lost);
      setLostKeys(lost);
      setPicked({});
      if (lost.length) setStage('replacing');
      else {
        setMessage(`${kept.length} 門都標成選上，已鎖定。`);
        close();
      }
    };
    return (
      <section aria-labelledby="result-title" className="well space-y-3 rounded-2xl p-3 text-sm">
        {header}
        <p>選上的保持打勾，<strong>沒選上的取消勾選</strong>。確定後選上的標成「已選上」並鎖定，沒選上的移出課表（留在候選），馬上給替補。</p>
        <div role="group" aria-label="選上的課">
        <ul className="space-y-1">
          {entries.map(({ course, item }) => (
            <li key={course.key}>
              <label className="raised flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl px-3 py-1.5">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={!unticked.has(course.key)}
                  onChange={(event) => setUnticked((previous) => {
                    const next = new Set(previous);
                    if (event.target.checked) next.delete(course.key);
                    else next.add(course.key);
                    return next;
                  })}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{course.title}</span>
                  <span className="tabular block text-xs text-base-content/75">{when(course)}</span>
                </span>
                {item.status === 'registered' && <span className="chip text-xs">已灌檔</span>}
                {unticked.has(course.key) && <span className="text-xs font-bold text-coral-ink">沒選上</span>}
              </label>
            </li>
          ))}
        </ul>
        </div>
        <button type="button" className="btn btn-primary btn-sm min-h-11 gap-1" onClick={confirm}>
          <Check className="size-4" aria-hidden="true" />
          {`確定：選上 ${kept.length} 門${lost.length ? `、沒選上 ${lost.length} 門` : ''}`}
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="result-title" className="well space-y-3 rounded-2xl p-3 text-sm">
      {header}
      <p>選上的已鎖定。沒選上的課，下面是排得進去的替補（避開衝堂、空堂日與早八），點一下就加進課表；名額以官方即時餘額為準。</p>
      {lostKeys.map((lostKey) => {
        const title = titleOf(lostKey);
        const replaced = picked[lostKey] && scheduled.has(picked[lostKey]!) ? picked[lostKey]! : null;
        const restored = scheduled.has(lostKey);
        const { sections, sameSlot } = replaced || restored ? { sections: [], sameSlot: [] } : replacementsFor(lostKey);
        const shownSections = sections.slice(0, sameSlot.length ? MAX_SHOWN - 1 : MAX_SHOWN);
        const shownSameSlot = sameSlot.slice(0, MAX_SHOWN - shownSections.length);
        const link = (key: string) => {
          const href = remainingUrl?.(key);
          return href ? <SafeLink href={href} label="即時餘額" /> : null;
        };
        return (
          <section key={lostKey} aria-label={`沒選上「${title}」的替補`} className="raised space-y-1.5 rounded-2xl px-3 py-2">
            <h4 className="font-bold">沒選上「{title}」</h4>
            {replaced ? (
              <p className="flex items-center gap-1.5 text-mist-ink"><Check className="size-4" aria-hidden="true" />已補上「{titleOf(replaced)}」</p>
            ) : restored ? (
              <p className="text-base-content/80">已放回課表。</p>
            ) : (
              <>
                {shownSections.length + shownSameSlot.length === 0 && <p className="text-base-content/80">找不到排得進去的別班或同時段的課。</p>}
                <ul className="divide-y divide-base-300">
                  {shownSections.map((section) => (
                    <li key={section.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="chip mr-1 text-xs">別班</span>
                        {section.teacher || '教師未定'}・<span className="tabular">{when(section)}</span>
                      </span>
                      {link(section.key)}
                      <button
                        type="button"
                        className="btn btn-sm min-h-11 gap-1"
                        aria-label={`換這班：${`${section.teacher ?? ''} ${when(section)}`.trim()}`}
                        onClick={() => { setPicked((previous) => ({ ...previous, [lostKey]: section.key })); onReplace(lostKey, section.key); }}
                      >
                        <ArrowLeftRight className="size-4" aria-hidden="true" />換這班
                      </button>
                    </li>
                  ))}
                  {shownSameSlot.map((course) => (
                    <li key={course.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="chip mr-1 text-xs">同時段</span>
                        {course.title}・<span className="tabular">{when(course)}</span>
                      </span>
                      {link(course.key)}
                      <button
                        type="button"
                        className="btn btn-sm min-h-11 gap-1"
                        aria-label={`改選這門：${course.title} ${when(course)}`}
                        onClick={() => { setPicked((previous) => ({ ...previous, [lostKey]: course.key })); onReplace(lostKey, course.key); }}
                      >
                        <Plus className="size-4" aria-hidden="true" />改選這門
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-ghost btn-sm min-h-11 gap-1 text-mist-ink" aria-label={`找這段時間的課：${title}原本的時段`} onClick={() => onFindSlot(lostKey)}>
                  <Search className="size-4" aria-hidden="true" />找這段時間的課
                </button>
              </>
            )}
          </section>
        );
      })}
      <button type="button" className="btn btn-sm min-h-11" onClick={close}>完成</button>
    </section>
  );
}
