import { NCCU_HOSTS, safeExternalUrl, type Course } from '@campusward/engine';
import { BookOpenText, ExternalLink } from 'lucide-react';
import { useRef, useState } from 'react';
import type { GeminiClient } from '../ai/gemini.ts';
import { AnswerText } from './AnswerText.tsx';
import { askSyllabi, type QaContext, type QaResult } from '../qa/answer.ts';
import type { SyllabusIndex } from '../qa/syllabusIndex.ts';
import { searchSyllabi } from '../qa/syllabusSearch.ts';
import type { SyllabusSource } from '../qa/syllabusSource.ts';

export interface QaSectionProps {
  source: SyllabusSource;
  term: string;
  courses: readonly Course[];
  client: Pick<GeminiClient, 'generate'>;
  /** 學生已確認條款並設定金鑰：才送 Gemini，否則只顯示本機搜尋到的課綱段落。 */
  aiReady: boolean;
}

const MAX_COURSES = 5;
const PASSAGES_PER_COURSE = 3;

function SyllabusLink({ course }: { course: Course | undefined }) {
  const href = safeExternalUrl(course?.links.syllabus, NCCU_HOSTS);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-mist-ink underline underline-offset-4">
      官方課綱<ExternalLink className="size-3" aria-hidden="true" /><span className="sr-only">（開新分頁，政大官方網站）</span>
    </a>
  );
}

/** 課綱問答（計畫 4.5）：先在本機課綱索引找段落；有金鑰時 Gemini 只根據這些段落回答。 */
export function QaSection({ source, term, courses, client, aiReady }: QaSectionProps) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<QaContext[] | null>(null);
  const [answer, setAnswer] = useState<QaResult | null>(null);
  const index = useRef<Promise<SyllabusIndex | null> | null>(null);
  const byCode = new Map(courses.map((course) => [course.code, course]));

  const loadIndex = () => {
    index.current ??= source.terms().then((terms) => (terms.includes(term) ? source.loadIndex(term) : null)).catch(() => null);
    return index.current;
  };

  const ask = async () => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setFound(null);
    setAnswer(null);
    try {
      const loaded = await loadIndex();
      if (!loaded) {
        index.current = null;
        setError('這學期的課綱資料還沒整理好，請先用搜課找課，或到官方課綱查看。');
        return;
      }
      const hits = searchSyllabi(loaded, text, 60);
      const codes = [...new Set(hits.map(({ code }) => code))].slice(0, MAX_COURSES);
      const context = (await Promise.all(codes.map(async (code) => {
        const syllabus = await source.loadCourse(term, code);
        if (!syllabus) return null;
        const positions = [...new Set(hits.filter((hit) => hit.code === code).map(({ passage }) => passage))].slice(0, PASSAGES_PER_COURSE);
        const passages = positions.flatMap((position) => (syllabus.passages[position] ? [syllabus.passages[position]] : []));
        return { code, title: byCode.get(code)?.title ?? syllabus.passages[0]?.text ?? code, passages };
      }))).filter((entry): entry is QaContext => entry !== null && entry.passages.length > 0);
      setFound(context);
      if (context.length && aiReady) setAnswer(await askSyllabi({ client, question: text, context }));
    } catch {
      setError('讀不到課綱資料，請檢查網路後再試。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="qa-heading" className="space-y-2 well px-3 py-2">
      <h3 id="qa-heading" className="flex items-center gap-1.5 font-semibold"><BookOpenText className="size-4" aria-hidden="true" />問課綱</h3>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <label className="input input-sm min-h-11 flex-1">
          <span className="sr-only">想問課程的什麼</span>
          <input value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：哪些課期末是交報告？" />
        </label>
        <button type="submit" className="btn btn-sm min-h-11" disabled={busy || !question.trim()}>{busy ? '查詢中…' : '查課綱'}</button>
      </form>
      {!aiReady && <p className="text-xs text-base-content/75">沒有金鑰也能查：會列出課綱裡相關的段落；設定金鑰後 AI 會根據這些段落回答。</p>}
      <div aria-live="polite" className="space-y-2">
      {error && <p role="alert" className="text-coral-ink">{error}</p>}
      {answer?.status === 'failed' && <p role="alert" className="text-coral-ink">{answer.message}</p>}
      {answer?.status === 'ok' && (
        <div className="rounded-field bg-base-200/60 px-3 py-2">
          <AnswerText text={answer.answer} knownCodes={new Set(byCode.keys())} />
          <p className="mt-1 text-xs text-base-content/75">
            AI 只根據下面的課綱段落回答，可能有誤，以官方課綱為準。
            {answer.citations.length > 0 && ` 根據：${answer.citations.map((code) => byCode.get(code)?.title ?? code).join('、')}`}
          </p>
        </div>
      )}
      {found && !found.length && <p>課綱裡找不到相關內容，換個說法試試。</p>}
      {found && found.length > 0 && (
        <ul aria-label="找到的課綱段落" className="space-y-2">
          {found.map(({ code, title, passages }) => (
            <li key={code} className="border-t border-base-300 pt-2">
              <p className="font-medium">{title}<span className="font-normal text-base-content/75"> · {code}</span></p>
              {passages.map(({ section, text }) => (
                <p key={`${section}${text.slice(0, 20)}`} className="line-clamp-3 text-xs"><span className="font-medium">{section}：</span>{text}</p>
              ))}
              <SyllabusLink course={byCode.get(code)} />
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
