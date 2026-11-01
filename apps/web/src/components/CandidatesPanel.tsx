import { candidateScheduleSummary, type ScheduleCourse } from '@campusward/engine';
import { Check, Heart, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { DAY_LABELS, formatCredits } from './labels.ts';

export interface CandidatesPanelProps {
  /** 候選清單（課程 key，依收藏順序）。 */
  candidates: readonly string[];
  catalog: ReadonlyMap<string, ScheduleCourse>;
  /** 目前方案裡的課。 */
  scheduledKeys: ReadonlySet<string>;
  /** 加入目前方案會和哪些課衝堂（課名）；用引擎的衝堂判斷。 */
  clashesOf: (course: ScheduleCourse) => readonly string[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  onStartSearch: () => void;
}

const quoteTitles = (titles: readonly string[]) => titles.map((title) => `「${title}」`).join('、');

/** 候選清單：按愛心收藏的課，看時間、學分、會不會衝堂，再決定加入課表或移除。 */
export function CandidatesPanel({ candidates, catalog, scheduledKeys, clashesOf, onAdd, onRemove, onStartSearch }: CandidatesPanelProps) {
  const unscheduled = candidates.filter((key) => !scheduledKeys.has(key)).length;
  return (
    <section aria-label="候選清單" className="space-y-3">
      {candidates.length === 0 ? (
        <div className="well space-y-3 rounded-2xl p-5 text-sm">
          <p className="flex items-center gap-2 text-base font-bold text-mist-ink">
            <Heart className="size-5" aria-hidden="true" />還沒有候選課
          </p>
          <p>在課程搜尋的結果按 ♡，可以先把想修的課收藏到這裡，之後再決定要不要排進課表。</p>
          <button type="button" className="btn btn-sm min-h-11 gap-1.5" onClick={onStartSearch}>
            <Search className="size-4" aria-hidden="true" />去搜課
          </button>
        </div>
      ) : (
        <>
          <p className="px-1 text-sm text-base-content/80">
            {candidates.length} 門候選，{unscheduled} 門還沒排進課表
          </p>
          <ul className="well divide-y divide-base-300 rounded-2xl px-3">
            {candidates.map((key) => {
              const course = catalog.get(key);
              const scheduled = scheduledKeys.has(key);
              const clashes = course && !scheduled ? clashesOf(course) : [];
              const clashing = clashes.length > 0;
              const title = course?.title ?? key;
              return (
                <li key={key}>
                  <article
                    data-clash={clashing ? 'true' : undefined}
                    className={`my-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-l-4 py-1 pl-3 ${clashing ? 'border-dashed border-coral-ink/50' : scheduled ? 'border-primary' : 'border-secondary'}`}
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <h3 className={`break-words text-base font-bold leading-snug ${clashing ? 'text-base-content/75' : ''}`}>{title}</h3>
                      {course ? (
                        <p className="text-sm">
                          {candidateScheduleSummary(course, DAY_LABELS, undefined, { clock: true }).split('・').map((part) => {
                            const [codes, clock] = part.split('（');
                            return <span key={part} className="mr-2 inline-block">{codes}{clock && <span className="whitespace-nowrap">（{clock}</span>}</span>;
                          })}
                          <span className="inline-block whitespace-nowrap text-xs text-base-content/75">{[course.code, formatCredits(course.credits)].filter(Boolean).join(' · ')}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-base-content/75">本學期資料找不到這門課，可以移除。</p>
                      )}
                      {clashing && (
                        <p className="mt-0.5 flex items-start gap-1 text-xs font-bold text-coral-ink">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          與{quoteTitles(clashes)}衝堂
                        </p>
                      )}
                    </div>
                    <span className="ml-auto flex items-center gap-1.5">
                      {scheduled ? (
                        <span className="chip inline-flex items-center gap-1"><Check className="size-3.5" aria-hidden="true" />已在課表</span>
                      ) : course && (
                        <button
                          type="button"
                          className={`btn btn-sm min-h-11 gap-1 ${clashing ? '' : 'btn-primary'}`}
                          aria-label={`加入課表：${title}`}
                          title={clashing ? `會與${quoteTitles(clashes)}衝堂` : undefined}
                          onClick={() => onAdd(key)}
                        >
                          <Plus className="size-4" aria-hidden="true" />加入課表
                        </button>
                      )}
                      <button type="button" className="btn btn-sm min-h-11 gap-1" aria-label={`移除候選：${title}`} onClick={() => onRemove(key)}>
                        <Trash2 className="size-4" aria-hidden="true" />移除
                      </button>
                    </span>
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
