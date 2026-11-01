import {
  findRetakes,
  matchMissingRequired,
  parseStudentExport,
  satisfiedPrerequisiteIds,
  toScheduleCourse,
  type Course,
  type GapItem,
  type IdentityProfile,
  type ScheduleEntry,
  type StudentRecord,
} from '@campusward/engine';
import { FileUp, GraduationCap, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface GraduationPanelProps {
  courses: readonly Course[];
  entries: readonly ScheduleEntry[];
  candidateKeys: ReadonlySet<string>;
  scheduledKeys: ReadonlySet<string>;
  profile: IdentityProfile;
  credits: number;
  onCandidate: (course: Course) => void;
  onProfile: (profile: IdentityProfile) => void;
}

const action = 'btn btn-sm min-h-11 gap-1.5';
const LEVEL = { undergrad: '學士班', graduate: '碩博士班' } as const;
const ADDITIONAL = { none: '沒有加修', minor: '輔系', double: '雙主修' } as const;
const YEAR = ['一', '二', '三', '四', '五', '六', '七'];

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

/** 畢業缺口：讀全人系統匯出檔裡學校自己的畢業審查（設計 8.5）。只在這台裝置的記憶體裡，重新整理就清掉，不送 AI。 */
export function GraduationPanel({ courses, entries, candidateKeys, scheduledKeys, profile, credits, onCandidate, onProfile }: GraduationPanelProps) {
  const [record, setRecord] = useState<StudentRecord | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const readFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    setError('');
    setMessage('');
    if (!file) return;
    // 原始檔讀完即丟：只留白名單解析結果，不進課表狀態、復原、備份或匯出檔。
    const result = parseStudentExport(await file.text());
    input.value = '';
    if (result.ok) setRecord(result.record);
    else setError(result.error.message);
  };

  const missing = useMemo(() => {
    const items: GapItem[] = [...(record?.audit.missingRequired ?? []), ...manual.map((label) => ({ label, count: 1 }))];
    return matchMissingRequired(items, courses);
  }, [courses, manual, record]);
  const retakes = useMemo(() => (record ? findRetakes(record, entries) : []), [entries, record]);
  const prerequisiteIds = useMemo(() => {
    if (!record) return [];
    const offered = new Set(courses.flatMap((course) => toScheduleCourse(course).eligibility.eligibilityRules?.map(({ conditionId }) => conditionId) ?? []));
    const accepted = new Set(profile.conditionIds ?? []);
    return satisfiedPrerequisiteIds(record).filter((id) => offered.has(id) && !accepted.has(id));
  }, [courses, profile.conditionIds, record]);

  const suggested = record?.suggestedProfile;
  const suggestionDiffers = suggested && (
    suggested.level !== profile.level || suggested.year !== profile.year || suggested.additionalMajor !== profile.additionalMajor
  );
  const audit = record?.audit;
  const noGaps = audit && !audit.missingRequired.length && !audit.gaps.length && !audit.unparsed.length;
  const titleOf = (key: string) => entries.find(({ course }) => course.key === key)?.course.title ?? key;

  return (
    <section aria-labelledby="graduation-heading" className="relief p-4">
      <h2 id="graduation-heading" className="flex items-center gap-2 text-sm font-semibold">
        <GraduationCap className="size-4" aria-hidden="true" />畢業缺口
      </h2>
      <p className="mt-1 text-xs text-base-content/75">
        讀全人系統匯出的檔案，顯示學校畢業審查列出的缺口。檔案只在這台裝置讀取，不上傳、不送 AI；分數不保留，重新整理後要重新上傳。檔案含大量個資，用完請刪除下載的檔案。
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className={`${action} cursor-pointer`}>
          <FileUp className="size-4" aria-hidden="true" />上傳全人系統匯出檔
          <input type="file" accept=".json,application/json" className="sr-only" aria-label="上傳全人系統匯出檔" onChange={(event) => void readFile(event.currentTarget)} />
        </label>
        {record && (
          <button type="button" className={action} onClick={() => { setRecord(null); setMessage('已清除匯入的修課資料。'); }}>
            <Trash2 className="size-4" aria-hidden="true" />清除修課資料
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-coral-ink">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}

      {record && audit && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-xs text-base-content/75">
            {[record.enrollment.major, record.enrollment.className].filter(Boolean).join(' · ')}
            {audit.checkedAt && ` · 學校審查資料日期 ${audit.checkedAt}`}
            {audit.curriculumYear && `（${audit.curriculumYear} 學年課程架構）`}
          </p>
          <p className="well px-3 py-2 text-xs">
            本學期正在修的課、抵免與交換課程尚未計入；以學校正式審查為準。
            {record.skippedCourseRows > 0 && ` 有 ${record.skippedCourseRows} 筆修課紀錄格式看不懂，已略過。`}
          </p>
          {audit.graduationCredits !== null && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['畢業學分', audit.graduationCredits],
                ['已得學分', audit.earnedCredits],
                ['還差', audit.remainingCredits],
                ['本方案', credits],
              ].map(([label, value]) => (
                <div key={label} className="well px-3 py-2">
                  <dt className="text-xs text-base-content/75">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          )}
          {noGaps && <p>學校審查未列出缺口。</p>}
          {audit.gaps.length > 0 && (
            <ul className="space-y-1">
              {audit.gaps.map((gap) => (
                <li key={gap.area}>
                  <span className="font-medium">{gap.label}</span>：{gap.items.length ? gap.items.map((item) => `${item.label}欠 ${countLabel(item)}`).join('、') : gap.text}
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
          {suggested && suggestionDiffers && (
            <div className="well px-3 py-2">
              <p>
                匯出檔看起來是：{suggested.level ? LEVEL[suggested.level] : '身分不明'}
                {suggested.year ? `${YEAR[suggested.year - 1]}年級` : ''}、{ADDITIONAL[suggested.additionalMajor ?? 'none']}。
                學分上下限依這些條件判斷，請確認正確再套用。
              </p>
              <button type="button" className={`${action} mt-2`} onClick={() => { onProfile({ ...profile, ...suggested }); setMessage('已套用身分條件。'); }}>
                套用到我的條件
              </button>
            </div>
          )}
          {prerequisiteIds.length > 0 && (
            <div className="well px-3 py-2">
              <p>你已通過的課符合本學期 {prerequisiteIds.length} 項擋修條件（只比對同名課）。</p>
              <button
                type="button"
                className={`${action} mt-2`}
                onClick={() => {
                  onProfile({ ...profile, conditionIds: [...(profile.conditionIds ?? []), ...prerequisiteIds] });
                  setMessage(`已勾選 ${prerequisiteIds.length} 項擋修條件，可在「條件」分頁改回。`);
                }}
              >
                勾選這些擋修條件
              </button>
            </div>
          )}
          {retakes.length > 0 && (
            <div role="note" className="rounded-field border border-coral-ink/40 px-3 py-2">
              <p className="font-medium">可能重複修習</p>
              <ul className="list-disc pl-5">
                {retakes.map((retake) => (
                  <li key={retake.key}>
                    「{titleOf(retake.key)}」與已通過的「{retake.passedTitle}」{retake.reason === 'code' ? '課號前六碼相同' : '同名'}，重複修習的學分通常不計入畢業學分（選課須知）。
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2 text-sm">
        <h3 className="font-semibold">還缺的必修</h3>
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
