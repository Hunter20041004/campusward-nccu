import { checkCourseLive, NCCU_HOSTS, safeExternalUrl, type Course, type LiveCheck, type LiveField } from '@campusward/engine';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { FEATURES } from '../features.ts';

const FIELD_LABELS: Record<LiveField, string> = {
  title: '課名', teacher: '教師', credits: '學分', scheduleText: '上課時間', classroom: '教室', meetings: '節次', restrictionText: '修課限制',
};
const liveValue = (course: Course, field: LiveField) => (field === 'meetings' ? course.scheduleText : String(course[field] ?? '')) || '（空白）';

/** 只把學期與課號送到政大公開查詢（隱私說明頁有寫）。 */
function LiveCheckButton({ course, fetchImpl }: { course: Course; fetchImpl: (url: URL) => Promise<Response> }) {
  const [state, setState] = useState<LiveCheck | 'loading' | null>(null);
  const run = async () => {
    setState('loading');
    setState(await checkCourseLive(course, fetchImpl));
  };
  return (
    <div aria-live="polite" className="space-y-1">
      <button type="button" className="btn btn-sm min-h-11 gap-1.5" onClick={() => void run()} disabled={state === 'loading'}>
        <RefreshCw className="size-4" aria-hidden="true" />{state === 'loading' ? '確認中…' : '向官方確認最新資料'}
      </button>
      {state && state !== 'loading' && (
        state.status === 'same' ? <p>和政大課程查詢目前的資料相同。</p>
          : state.status === 'missing' ? <p className="text-coral-ink">政大課程查詢目前查不到這門課，可能已停開，請到學校系統確認。</p>
            : state.status === 'failed' ? <p className="text-coral-ink">連不上政大課程查詢，請稍後再試。</p>
              : (
                <div className="rounded-field border border-coral-ink/40 px-3 py-2">
                  <p className="font-medium">學校已更新這門課（以學校為準）：</p>
                  <ul className="list-disc pl-5">
                    {state.fields.filter((field) => field !== 'meetings' || !state.fields.includes('scheduleText')).map((field) => (
                      <li key={field}>{FIELD_LABELS[field]}：{liveValue(course, field)} → {liveValue(state.live, field)}</li>
                    ))}
                  </ul>
                </div>
              )
      )}
    </div>
  );
}

function OfficialLink({ href, label }: { href: string | undefined; label: string }) {
  // 所有外部連結都經引擎的 safeExternalUrl（只放行 https 政大網域）。
  const safe = safeExternalUrl(href, NCCU_HOSTS);
  if (!safe) return null;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-field px-1 text-sm font-medium text-mist-ink underline underline-offset-4">
      {label}
      <ExternalLink className="size-3.5" aria-hidden="true" />
      <span className="sr-only">（開新分頁，政大官方網站）</span>
    </a>
  );
}

export function CourseDetails({ course, id, fetchImpl = (url) => fetch(url, { headers: { accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' }) }: { course: Course; id: string; fetchImpl?: (url: URL) => Promise<Response> }) {
  const { official, notes } = course;
  const rows = ([
    ['教室', course.classroom],
    ['修別', official.requirementKind],
    ['開課班級', official.targetGroup],
    ['授課語言', official.language],
    ['學制', official.degreeLevel],
    ['學期', official.semesterSpan],
    ['選課方式', official.enrollmentType],
    ['遠距', official.remoteMode],
  ] as [string, string][]).filter(([, value]) => Boolean(value));
  const noteGroups = ([
    ['上課方式', notes.deliveryNotes],
    ['學程與分類', notes.programTags],
    ['其他說明', notes.informationNotes],
  ] as [string, string[]][]).filter(([, values]) => values.length > 0);
  return (
    <section id={id} aria-label={`${course.title} 詳細資料`} className="mt-3 space-y-3 border-t border-base-300 pt-3 text-sm">
      {course.restrictionText && (
        <p className="rounded-field bg-secondary/40 px-3 py-2 text-secondary-content">
          <span className="font-medium">修課限制：</span>
          {course.restrictionText}
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-base-content/75">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {noteGroups.map(([label, values]) => (
        <div key={label}>
          <p className="font-medium">{label}</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
            {values.map((value) => <li key={value}>{value}</li>)}
          </ul>
        </div>
      ))}
      {course.events.length > 0 && (
        <div>
          <p className="font-medium">考試與活動</p>
          <ul className="mt-0.5 list-disc pl-5">
            {course.events.map((event) => <li key={`${event.label}${event.date ?? ''}`}>{[event.date, event.label].filter(Boolean).join(' ')}</li>)}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3">
        <OfficialLink href={course.links.syllabus} label="課綱" />
        <OfficialLink href={course.links.remaining} label="即時餘額" />
        <OfficialLink href={course.links.teacher} label="教師資訊" />
      </div>
      {FEATURES.liveCheck && <LiveCheckButton course={course} fetchImpl={fetchImpl} />}
    </section>
  );
}
