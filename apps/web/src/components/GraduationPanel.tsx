import {
  addCourse,
  gapGeneralEducation,
  matchMissingRequired,
  pickGapCourse,
  toScheduleCourse,
  type AuditGap,
  type Course,
  type FillContext,
  type GapItem,
  type GapPick,
  type GapTarget,
  type IdentityProfile,
  type StudentRecord,
} from '@campusward/engine';
import { CalendarPlus, ListChecks, Plus } from 'lucide-react';
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
  /** 「排一門進去」的本機規則（目前方案、偏好、學分上限…）；沒給就只能放進候選。 */
  fill?: FillContext;
  /** 學生系級的系（群修缺口用）。 */
  department?: string;
  /** 把補缺口的課排進目前方案（一筆可復原的修改）。 */
  onAddGapCourses?: (keys: string[], label: string) => void;
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

interface GapRow {
  id: string;
  /** 按鈕與提示用的名稱，例「體育」「一般通識」「合成必修甲」。 */
  label: string;
  target: GapTarget | null;
  /** 沒辦法排的原因（例：群修要先設定系級）。 */
  note?: string;
}

/** 學校審查的缺口 → 可以排一門進去的目標（只寫學分數的畢業學分交給「幫我排滿」）。 */
function gapRows(gaps: readonly AuditGap[], categories: readonly string[], department: string | undefined): Map<string, GapRow> {
  const rows = new Map<string, GapRow>();
  gaps.forEach((gap) => {
    if (gap.area === 'pe') rows.set(gap.area, { id: gap.area, label: gap.label, target: { type: 'pe' } });
    if (gap.area === 'general' || gap.area === 'liberal' || gap.area === 'chinese' || gap.area === 'english') {
      const wanted = gapGeneralEducation([gap], categories);
      rows.set(gap.area, { id: gap.area, label: gap.label, target: wanted.length ? { type: 'category', categories: wanted } : null });
    }
    if (gap.area === 'group') {
      rows.set(gap.area, department
        ? { id: gap.area, label: gap.label, target: { type: 'group', department } }
        : { id: gap.area, label: gap.label, target: null, note: '在課表上方設定系級後，可以排本系群修' });
    }
  });
  return rows;
}

function GapAction({ row, pick, titleOf, onAdd }: {
  row: GapRow;
  pick: GapPick | null;
  titleOf: (key: string) => string;
  onAdd?: (keys: string[], label: string) => void;
}) {
  if (row.note) return <p className="text-xs text-base-content/75">{row.note}</p>;
  if (!pick) return null;
  if (pick.status === 'covered') {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="chip">補缺口</span>已排入「{titleOf(pick.key)}」
      </p>
    );
  }
  if (pick.status === 'none') {
    // 必修本學期沒開：下面的開課清單已經寫了「本學期沒有同名開課」。
    if (row.target?.type === 'title' && !pick.closest.length) return null;
    return (
      <p className="text-xs text-base-content/75">
        {pick.reason}
        {pick.closest.length > 0 && `；最接近的：${pick.closest.map(({ key, problems }) => `「${titleOf(key)}」（${problems.join('、')}）`).join('、')}`}
      </p>
    );
  }
  if (!onAdd) return null;
  return (
    <button
      type="button"
      className={`${action} mt-1`}
      aria-label={`排一門進去（${titleOf(pick.key)}）：${row.label}缺口`}
      onClick={() => onAdd([pick.key], `已補缺口：排入「${titleOf(pick.key)}」`)}
    >
      <CalendarPlus className="size-4" aria-hidden="true" />排一門進去
      <span className="text-xs font-normal text-base-content/75">（{titleOf(pick.key)}）</span>
    </button>
  );
}

/** 畢業缺口：讀全人系統資料裡學校自己的畢業審查（設計 8.5）。資料與其他功能共用（StudentRecordCard）。 */
export function GraduationPanel({ courses, record, onRecord, candidateKeys, scheduledKeys, profile, credits, onCandidate, onProfile, fill, department, onAddGapCourses }: GraduationPanelProps) {
  const [manual, setManual] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const missing = useMemo(() => {
    const items: GapItem[] = [...(record?.audit.missingRequired ?? []), ...manual.map((label) => ({ label, count: 1 }))];
    return matchMissingRequired(items, courses);
  }, [courses, manual, record]);
  const audit = record?.audit;
  const noGaps = audit && !audit.missingRequired.length && !audit.gaps.length && !audit.unparsed.length;

  // 每一列缺口（必修、體育、通識、群修）挑一門排得進去的課，規則同「幫我排滿」；全部在本機算，修課紀錄不送 AI。
  const categories = useMemo(() => [...new Set(courses.map(({ official }) => official.generalEducation).filter(Boolean))], [courses]);
  const rows = useMemo(() => {
    const required: GapRow[] = missing.map((item) => ({ id: `required:${item.label}`, label: item.label, target: { type: 'title', title: item.label } }));
    return [...required, ...gapRows(audit?.gaps ?? [], categories, department).values()];
  }, [audit, categories, department, missing]);
  const picks = useMemo(() => new Map(rows.map((row) => [row.id, fill && row.target ? pickGapCourse(fill, row.target) : null])), [fill, rows]);
  const titleOf = (key: string) => fill?.catalog.find((course) => course.key === key)?.title ?? '課程';
  // 「全部補上」：一列一列挑，後面的會避開前面挑好的課（不衝堂、同名只排一門、科目數上限）。
  const fillAll = useMemo(() => {
    if (!fill) return [];
    const keys: string[] = [];
    let entries = [...fill.entries];
    rows.forEach((row) => {
      if (!row.target) return;
      const pick = pickGapCourse({ ...fill, entries }, row.target);
      if (pick.status !== 'picked') return;
      const course = fill.catalog.find(({ key }) => key === pick.key);
      if (!course) return;
      keys.push(pick.key);
      entries = [...entries, { course, item: addCourse([], course)[0]! }];
    });
    return keys;
  }, [fill, rows]);
  const gapAction = (id: string) => {
    const row = rows.find((candidate) => candidate.id === id);
    return row ? <GapAction row={row} pick={picks.get(id) ?? null} titleOf={titleOf} {...(onAddGapCourses ? { onAdd: onAddGapCourses } : {})} /> : null;
  };

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
          {onAddGapCourses && fillAll.length > 0 && (
            <button type="button" className="btn btn-primary btn-sm min-h-11 gap-1.5" onClick={() => onAddGapCourses(fillAll, `已補缺口：排入 ${fillAll.length} 門`)}>
              <ListChecks className="size-4" aria-hidden="true" />全部補上（{fillAll.length} 門）
            </button>
          )}
          {audit.gaps.length > 0 && (
            <ul className="space-y-2">
              {audit.gaps.map((gap) => (
                <li key={gap.area}>
                  <span className="font-bold">{gap.label}</span>：{gap.items.length ? gap.items.map((item) => `${item.label}欠 ${countLabel(item)}`).join('、') : gap.text}
                  {gapAction(gap.area)}
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
              {gapAction(`required:${item.label}`)}
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
