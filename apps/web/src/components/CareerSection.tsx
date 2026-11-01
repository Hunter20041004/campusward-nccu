import { toScheduleCourse, type Change, type Course } from '@campusward/engine';
import { Compass, Plus } from 'lucide-react';
import { useState } from 'react';
import { recommendForCareer, type CareerResult } from '../ai/career.ts';
import type { GeminiClient } from '../ai/gemini.ts';

export interface CareerSectionProps {
  client: Pick<GeminiClient, 'generate'>;
  termLabel: string;
  courses: readonly Course[];
  candidateKeys: ReadonlySet<string>;
  onAddCandidates: (changes: Change[], label: string) => void;
}

const action = 'btn btn-sm min-h-11 gap-1.5 border border-base-300 bg-base-100';

/** 職涯推薦：AI 整理能力與關鍵字，課程由本機快照搜尋；不改課表，只能由學生放進候選。 */
export function CareerSection({ client, termLabel, courses, candidateKeys, onAddCandidates }: CareerSectionProps) {
  const [direction, setDirection] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CareerResult | null>(null);

  const run = async () => {
    if (!direction.trim() || busy) return;
    setBusy(true);
    setResult(await recommendForCareer({ client, direction, termLabel, courses }));
    setBusy(false);
  };

  return (
    <section aria-labelledby="career-heading" className="space-y-2 rounded-field border border-base-300 px-3 py-2">
      <h3 id="career-heading" className="flex items-center gap-1.5 font-semibold"><Compass className="size-4" aria-hidden="true" />職涯方向找課</h3>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <label className="input input-sm min-h-11 flex-1">
          <span className="sr-only">想走的職涯方向</span>
          <input value={direction} maxLength={300} onChange={(event) => setDirection(event.target.value)} placeholder="例如：資料分析師、產品經理" />
        </label>
        <button type="submit" className={action} disabled={busy || !direction.trim()}>{busy ? '整理中…' : '找相關的課'}</button>
      </form>
      {result?.status === 'failed' && <p role="alert" className="text-coral-ink">{result.message}</p>}
      {result?.status === 'ok' && (
        <div className="space-y-2">
          <p className="text-xs text-base-content/75">AI 依一般知識整理，未上網查證；職涯資訊請自己再確認。課程是 Campusward 在本學期課程資料裡用關鍵字找到的。</p>
          <p className="whitespace-pre-wrap">{result.summary}</p>
          {result.skills.map((skill) => (
            <div key={skill.name}>
              <p className="font-medium">{skill.name}<span className="font-normal text-base-content/75">{skill.why && ` · ${skill.why}`}</span></p>
              {skill.courses.length ? (
                <ul className="mt-1 space-y-1">
                  {skill.courses.map((course) => {
                    const key = toScheduleCourse(course).key;
                    return (
                      <li key={key} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1">{course.title}<span className="text-base-content/75"> · {course.code} · {course.teacher || '教師未定'} · {course.scheduleText || '時間未定'}</span></span>
                        {candidateKeys.has(key) ? <span className="text-xs text-base-content/75">已在候選</span> : (
                          <button type="button" className={action} aria-label={`把 ${course.title}（${course.code}）放進候選`} onClick={() => onAddCandidates([{ type: 'addCandidate', key }], `已放進候選「${course.title}」`)}>
                            <Plus className="size-4" aria-hidden="true" />候選
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-xs text-base-content/75">本學期找不到相關課名。</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
