import { matchMissingRequired, toScheduleCourse, type Course, type GapItem, type IdentityProfile, type StudentRecord } from '@campusward/engine';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { StudentRecordCard } from './StudentRecordCard.tsx';

export interface GraduationPanelProps {
  courses: readonly Course[];
  record: StudentRecord | null;
  onRecord: (record: StudentRecord | null) => void;
  candidateKeys: ReadonlySet<string>;
  scheduledKeys: ReadonlySet<string>;
  profile: IdentityProfile;
  credits: number;
  onCandidate: (course: Course) => void;
  onProfile: (profile: IdentityProfile) => void;
}

const action = 'btn btn-sm min-h-11 gap-1.5';

const countLabel = ({ count, unit }: GapItem) => `${count} ${unit ?? '門'}`;

function Offerings({ item, courses, candidateKeys, scheduledKeys, onCandidate }: {
  item: GapItem & { offerings: Course[] };
  courses: readonly Course[];
  candidateKeys: ReadonlySet<string>;
  scheduledKeys: ReadonlySet<string>;
  onCandidate: (course: Course) => void;
}) {
  if (!courses.length) return null;
  if (!item.offerings.length) return <p className="text-xs text-base-content/75">本學期沒有同名開課。</p>;
  return (
    <ul className="mt-1 space-y-1">
      {item.offerings.map((course) => {
        const key = toScheduleCourse(course).key;
        const state = scheduledKeys.has(key) ? '已排入' : candidateKeys.has(key) ? '已在候選' : null;
        return (
          <li key={key} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              {course.title}<span className="text-base-content/75"> · {course.code} · {course.teacher || '教師未定'}</span>
            </span>
            {state ? (
              <span className="text-xs text-base-content/75">{state}</span>
            ) : (
              <button type="button" className={action} onClick={() => onCandidate(course)} aria-label={`把 ${course.title}（${course.code}）放進候選`}>
                <Plus className="size-4" aria-hidden="true" />放進候選
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 畢業缺口：讀全人系統資料裡學校自己的畢業審查（設計 8.5）。資料與其他功能共用（StudentRecordCard）。 */
export function GraduationPanel({ courses, record, onRecord, candidateKeys, scheduledKeys, profile, credits, onCandidate, onProfile }: GraduationPanelProps) {
  const [manual, setManual] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const missing = useMemo(() => {
    const items: GapItem[] = [...(record?.audit.missingRequired ?? []), ...manual.map((label) => ({ label, count: 1 }))];
    return matchMissingRequired(items, courses);
  }, [courses, manual, record]);
  const audit = record?.audit;
  const noGaps = audit && !audit.missingRequired.length && !audit.gaps.length && !audit.unparsed.length;

  return (
    <section className="space-y-3">
      <div className="well rounded-2xl p-4">
        <StudentRecordCard record={record} onRecord={onRecord} courses={courses} profile={profile} onProfile={onProfile} />
      </div>

      {record && audit && (
        <div className="well space-y-3 rounded-2xl p-4 text-sm">
          <h3 className="text-base font-bold text-mist-ink">學校畢業審查</h3>
          <p className="text-xs text-base-content/75">
            {audit.checkedAt && `資料日期 ${audit.checkedAt}`}
            {audit.curriculumYear && `（${audit.curriculumYear} 學年課程架構）`}。本學期正在修的課、抵免與交換課程尚未計入；以學校正式審查為準。
          </p>
          {audit.graduationCredits !== null && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['畢業學分', audit.graduationCredits],
                ['已得學分', audit.earnedCredits],
                ['還差', audit.remainingCredits],
                ['本方案', credits],
              ].map(([label, value]) => (
                <div key={label} className="raised rounded-2xl px-3 py-2">
                  <dt className="text-xs text-base-content/75">{label}</dt>
                  <dd className="font-bold tabular-nums">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          )}
          {noGaps && <p>學校審查未列出缺口。</p>}
          {audit.gaps.length > 0 && (
            <ul className="space-y-1">
              {audit.gaps.map((gap) => (
                <li key={gap.area}>
                  <span className="font-bold">{gap.label}</span>：{gap.items.length ? gap.items.map((item) => `${item.label}欠 ${countLabel(item)}`).join('、') : gap.text}
                </li>
              ))}
            </ul>
          )}
          {audit.unparsed.length > 0 && (
            <div>
              <p className="text-xs text-base-content/75">看不懂的審查內容（原文）：</p>
              <ul className="list-disc pl-5">{audit.unparsed.map((text) => <li key={text}>{text}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      <div className="well space-y-2 rounded-2xl p-4 text-sm">
        <h3 className="text-base font-bold text-mist-ink">還缺的必修</h3>
        {!missing.length && <p className="text-xs text-base-content/75">{record ? '學校審查沒有列出缺的必修。' : '上傳匯出檔，或自己輸入要補的課名。'}</p>}
        <ul className="space-y-2">
          {missing.map((item) => (
            <li key={item.label}>
              <p className="font-medium">
                {item.label}
                {item.count > 1 && <span className="font-normal text-base-content/75"> · {countLabel(item)}（學校原文：缺{item.label}{item.count}）</span>}
              </p>
              <Offerings item={item} courses={courses} candidateKeys={candidateKeys} scheduledKeys={scheduledKeys} onCandidate={onCandidate} />
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const label = draft.trim();
            if (label && !manual.includes(label)) setManual([...manual, label]);
            setDraft('');
          }}
        >
          <label className="input input-sm min-h-11 flex-1">
            <span className="sr-only">要補的課名</span>
            <input value={draft} maxLength={60} onChange={(event) => setDraft(event.target.value)} placeholder="自己輸入要補的課名" />
          </label>
          <button type="submit" className={action}>找本學期開課</button>
        </form>
      </div>
    </section>
  );
}
