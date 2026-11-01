import {
  candidateScheduleSummary,
  chooseSections,
  classOptions,
  classRequiredCourses,
  classYear,
  formatClassName,
  parseClassName,
  toScheduleCourse,
  type ClassName,
  type Course,
  type CourseGroup,
  type IdentityProfile,
  type ScheduleEntry,
} from '@campusward/engine';
import { BookCheck, ChevronDown, GraduationCap, Plus, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { DAY_LABELS } from './labels.ts';

export interface ClassBarProps {
  courses: readonly Course[];
  profile: IdentityProfile;
  onProfile: (profile: IdentityProfile) => void;
  /** 目前方案的課：挑班要避開它們。 */
  entries: readonly ScheduleEntry[];
  preferences: { freeDays: readonly number[]; noEarly?: boolean };
  /** 全人系統匯出檔讀到的系級（學生按一次確認才寫入）。 */
  suggested?: { className: string; profile: Pick<IdentityProfile, 'level' | 'year' | 'additionalMajor'> } | null;
  /** 一次加入多門課（一筆可復原的修改）。 */
  onAddCourses: (keys: string[], label: string) => void;
  /** 排不進去的必修：搜這門課讓學生自己挑班。 */
  onSearch: (text: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

const YEARS = [
  { year: 1, label: '大一' },
  { year: 2, label: '大二' },
  { year: 3, label: '大三' },
  { year: 4, label: '大四' },
] as const;
const YEAR_CHARS = '一二三四五六七';

const keyOf = (course: Course) => toScheduleCourse(course).key;
const when = (course: Course) => candidateScheduleSummary(toScheduleCourse(course), DAY_LABELS);
const without = (profile: IdentityProfile, ...fields: (keyof IdentityProfile)[]) => {
  const next = { ...profile };
  fields.forEach((field) => delete next[field]);
  return next;
};

/**
 * 課表上方的系級（2026-11-01 易用性審查第 1 名，使用者核可）：選一次系級，就列出本班本學期必修、自動挑不衝堂的班一鍵排入；
 * 年級也決定學分上下限。只依官方開課班級與修別，不從課名猜，畫面寫明「以系上公告為準」。
 */
export function ClassBar({ courses, profile, onProfile, entries, preferences, suggested, onAddCourses, onSearch, inputRef }: ClassBarProps) {
  const options = useMemo(() => classOptions(courses), [courses]);
  const [draft, setDraft] = useState(profile.className ?? '');
  useEffect(() => setDraft(profile.className ?? ''), [profile.className]);
  const className = useMemo(() => (profile.className ? parseClassName(profile.className) : null), [profile.className]);

  const commit = (value: string) => {
    setDraft(value);
    if (!value.trim()) {
      if (profile.className) onProfile(without(profile, 'className'));
      return;
    }
    const parsed = parseClassName(value);
    if (!parsed) return;
    const name = formatClassName(parsed);
    // 打到一半（「資訊」→「資訊二」）只在選單裡有這個系級時才寫入，免得每打一個字就改一次身分。
    if (!options.some((option) => option.value === name) || name === profile.className) return;
    onProfile({ ...profile, className: name, level: 'undergrad', year: classYear(parsed) });
  };

  const setYear = (year: number) => {
    const next = className ? formatClassName({ ...className, grade: `${className.grade.slice(0, -1)}${YEAR_CHARS[year - 1]}` }) : undefined;
    onProfile({ ...profile, ...(next ? { className: next } : {}), level: 'undergrad', year });
  };

  const showSuggestion = suggested && parseClassName(suggested.className) && suggested.className !== profile.className;

  return (
    <section aria-label="我的系級" className="well space-y-2 rounded-2xl px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 basis-48 items-center gap-2 text-sm font-bold">
          <GraduationCap className="size-4 shrink-0 text-mist-ink" aria-hidden="true" />
          <span className="shrink-0">我的系級</span>
          <input
            ref={inputRef}
            id="identity-class"
            aria-label="系級"
            list="class-options"
            className="input input-sm min-h-11 min-w-0 flex-1 font-normal"
            placeholder="例：資訊二、會計二甲"
            value={draft}
            onChange={(event) => commit(event.target.value)}
            autoComplete="off"
          />
          <datalist id="class-options">
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </datalist>
        </label>
        <YearChoice profile={profile} onYear={setYear} onGraduate={() => onProfile({ ...without(profile, 'className', 'year'), level: 'graduate' })} />
      </div>
      {showSuggestion && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>全人系統資料是「{suggested.className}」，要用這個系級嗎？</span>
          <button type="button" className="btn btn-sm min-h-11" onClick={() => onProfile({ ...profile, ...suggested.profile, className: suggested.className })}>
            用這個系級
          </button>
        </p>
      )}
      {className && profile.className && (
        <RequiredCourses
          key={profile.className}
          className={className}
          name={profile.className}
          courses={courses}
          entries={entries}
          preferences={preferences}
          onAddCourses={onAddCourses}
          onSearch={onSearch}
        />
      )}
    </section>
  );
}

/** 年級：單選（一個 Tab 停留點，左右鍵切換），延畢的學生選大四（學分下限相同）。 */
function YearChoice({ profile, onYear, onGraduate }: { profile: IdentityProfile; onYear: (year: number) => void; onGraduate: () => void }) {
  const choices = [...YEARS.map(({ year, label }) => ({ id: String(year), label })), { id: 'graduate', label: '研究所' }];
  const selected = profile.level === 'graduate' ? 'graduate'
    : profile.level === 'undergrad' && profile.year ? String(Math.min(profile.year, 4)) : '';
  const choose = (id: string) => (id === 'graduate' ? onGraduate() : onYear(Number(id)));
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = choices[(index + step + choices.length) % choices.length]!;
    choose(next.id);
    (event.currentTarget.parentElement?.children[(index + step + choices.length) % choices.length] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label="年級" className="flex flex-wrap gap-1">
      {choices.map(({ id, label }, index) => {
        const checked = selected === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (!selected && index === 0) ? 0 : -1}
            onClick={() => choose(id)}
            onKeyDown={(event) => move(event, index)}
            className={`btn btn-sm min-h-11 min-w-11 px-2.5 ${checked ? 'tab-selected text-mist-ink' : ''}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function RequiredCourses({ className, name, courses, entries, preferences, onAddCourses, onSearch }: {
  className: ClassName;
  name: string;
} & Pick<ClassBarProps, 'courses' | 'entries' | 'preferences' | 'onAddCourses' | 'onSearch'>) {
  const { required, maybe } = useMemo(() => classRequiredCourses(courses, className), [className, courses]);
  const scheduled = useMemo(() => new Set(entries.map(({ course }) => course.key)), [entries]);
  const isScheduled = (group: CourseGroup) => group.courses.some((course) => scheduled.has(keyOf(course)));
  const pending = useMemo(() => required.filter((group) => !group.courses.some((course) => scheduled.has(keyOf(course)))), [required, scheduled]);
  const choice = useMemo(
    () => chooseSections(pending.map(({ id, courses: sections }) => ({ id, options: sections.map(toScheduleCourse) })), entries, preferences),
    [entries, pending, preferences],
  );
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const titleOfKey = (key: string) => entries.find(({ course }) => course.key === key)?.course.title
    ?? courses.find((course) => keyOf(course) === key)?.title ?? '課程';
  const chosen = choice.picks.filter(({ groupId }) => !unticked.has(groupId));
  const heading = `${name} 本學期必修`;

  return (
    <section aria-label={heading} className="space-y-1.5 border-t border-base-300 pt-2 text-sm">
      {required.length === 0 ? (
        <p className="text-base-content/80">這學期沒有找到開課班級寫「{name}」的必修（依官方開課班級，以系上公告為準）。</p>
      ) : pending.length === 0 ? (
        <p className="flex items-center gap-1.5">
          <BookCheck className="size-4 text-mist-ink" aria-hidden="true" />
          <span><strong>{name}</strong> 本學期必修 {required.length} 門都在課表上<span className="text-xs text-base-content/75">（依官方開課班級，以系上公告為準）</span></span>
        </p>
      ) : (
        <>
          <p>
            <strong>{name}</strong> 本學期必修 {required.length} 門
            <span className="text-xs text-base-content/75">（依官方開課班級，以系上公告為準）</span>
          </p>
          <ul className="space-y-0.5">
            {required.map((group) => {
              if (isScheduled(group)) {
                return <li key={group.id} className="flex min-h-11 items-center gap-2 pl-1 text-base-content/75"><BookCheck className="size-4" aria-hidden="true" />{group.title}・已在課表</li>;
              }
              const pick = choice.picks.find(({ groupId }) => groupId === group.id);
              const course = pick ? group.courses.find((section) => keyOf(section) === pick.key) : undefined;
              if (!course) {
                const blockers = choice.unplaced.find(({ groupId }) => groupId === group.id)?.clashesWith ?? [];
                return (
                  <li key={group.id} className="flex flex-wrap items-center gap-2 pl-1">
                    <TriangleAlert className="size-4 shrink-0 text-coral-ink" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-coral-ink">{group.title}：每一班都和{blockers.map((key) => `「${titleOfKey(key)}」`).join('、') || '其他課'}衝堂</span>
                    <button type="button" className="btn btn-sm min-h-11 gap-1" aria-label={`搜尋${group.title}`} onClick={() => onSearch(group.title)}>
                      <Search className="size-4" aria-hidden="true" />自己選班
                    </button>
                  </li>
                );
              }
              const checked = !unticked.has(group.id);
              return (
                <li key={group.id}>
                  <label className="flex min-h-11 items-center gap-2 pl-1">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={checked}
                      onChange={() => setUnticked((previous) => {
                        const next = new Set(previous);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })}
                    />
                    <span className="min-w-0 flex-1">
                      {group.title}
                      <span className="tabular ml-2 text-xs text-base-content/75">{when(course)}{group.courses.length > 1 ? `・${group.courses.length} 班中挑不衝堂的這班` : ''}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {choice.picks.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm min-h-11 gap-1"
              disabled={chosen.length === 0}
              onClick={() => onAddCourses(chosen.map(({ key }) => key), `已排入${name}必修 ${chosen.length} 門`)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {chosen.length === choice.picks.length ? '全部排入' : `排入勾選的 ${chosen.length} 門`}
            </button>
          )}
        </>
      )}
      {maybe.length > 0 && <MaybeCourses groups={maybe} entries={entries} preferences={preferences} scheduled={scheduled} onAddCourses={onAddCourses} />}
    </section>
  );
}

function MaybeCourses({ groups, entries, preferences, scheduled, onAddCourses }: {
  groups: readonly CourseGroup[];
  scheduled: ReadonlySet<string>;
} & Pick<ClassBarProps, 'entries' | 'preferences' | 'onAddCourses'>) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-1.5 text-sm">
        <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
        <span className="whitespace-nowrap">可能要修 {groups.length} 門</span>
        <span className="text-xs text-base-content/75">（開課班級只寫系、看不出年級，不會自動排入）</span>
      </summary>
      <ul className="space-y-0.5 pl-1">
        {groups.map((group) => {
          if (group.courses.some((course) => scheduled.has(keyOf(course)))) {
            return <li key={group.id} className="flex min-h-11 items-center gap-2 text-base-content/75"><BookCheck className="size-4" aria-hidden="true" />{group.title}・已在課表</li>;
          }
          const pick = chooseSections([{ id: group.id, options: group.courses.map(toScheduleCourse) }], entries, preferences).picks[0];
          const course = pick ? group.courses.find((section) => keyOf(section) === pick.key) : undefined;
          return (
            <li key={group.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">{group.title}{course && <span className="tabular ml-2 text-xs text-base-content/75">{when(course)}</span>}</span>
              {course ? (
                <button type="button" className="btn btn-sm min-h-11 gap-1" aria-label={`加入${group.title}（${when(course)}）`} onClick={() => onAddCourses([keyOf(course)], `已加入「${group.title}」`)}>
                  <Plus className="size-4" aria-hidden="true" />加入
                </button>
              ) : (
                <span className="text-xs text-coral-ink">每一班都會衝堂</span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
