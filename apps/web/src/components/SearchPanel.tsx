import { candidateScheduleSummary, searchCourses, toScheduleCourse, type Course } from '@campusward/engine';
import { BookmarkPlus, Check, ChevronDown, Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CourseDetails } from './CourseDetails.tsx';
import { CourseTags } from './CourseTags.tsx';
import { DAY_LABELS, DAYPARTS, formatCredits } from './labels.ts';

const PAGE = 50;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export interface SearchPanelProps {
  courses: readonly Course[];
  query: string;
  scheduledKeys: ReadonlySet<string>;
  candidateKeys: ReadonlySet<string>;
  onAdd: (course: Course) => void;
  onRemove: (course: Course) => void;
  onCandidate: (course: Course) => void;
}

function Chip({ pressed, onClick, children, label }: { pressed: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={`min-h-11 min-w-11 rounded-selector border px-2.5 text-sm transition-colors duration-150 ${
        pressed ? 'border-mist-ink bg-primary/20 font-medium text-mist-ink' : 'border-base-300 bg-base-100 hover:border-primary'
      }`}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(values: T[], value: T) => (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

export function SearchPanel({ courses, query, scheduledKeys, candidateKeys, onAdd, onRemove, onCandidate }: SearchPanelProps) {
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [dayparts, setDayparts] = useState<string[]>([]);
  const [generalEducation, setGeneralEducation] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(courses.map(({ official }) => official.generalEducation).filter(Boolean))].sort(),
    [courses],
  );
  const filtering = Boolean(query.trim() || weekdays.length || dayparts.length || generalEducation);
  const results = useMemo(() => (filtering ? searchCourses(courses, {
    text: query,
    weekdays,
    periods: DAYPARTS.filter(({ id }) => dayparts.includes(id)).flatMap(({ periods }) => periods),
    ...(generalEducation ? { generalEducation: [generalEducation] } : {}),
  }) : []), [courses, dayparts, filtering, generalEducation, query, weekdays]);

  const resetPaging = () => setShown(PAGE);

  return (
    <div className="flex h-full flex-col gap-3">
      <fieldset className="space-y-2">
        <legend className="sr-only">篩選</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="星期">
          {WEEKDAYS.map((day) => (
            <Chip key={day} label={DAY_LABELS[day]} pressed={weekdays.includes(day)} onClick={() => { setWeekdays(toggle(weekdays, day)); resetPaging(); }}>
              {DAY_LABELS[day]!.slice(1)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="時段">
          {DAYPARTS.map(({ id, label }) => (
            <Chip key={id} pressed={dayparts.includes(id)} onClick={() => { setDayparts(toggle(dayparts, id)); resetPaging(); }}>{label}</Chip>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span>通識類別</span>
            <select
              className="select select-sm min-h-11 w-auto"
              value={generalEducation}
              onChange={(event) => { setGeneralEducation(event.target.value); resetPaging(); }}
            >
              <option value="">全部</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      {!filtering ? (
        <p className="text-sm text-base-content/80">輸入課名、教師或課號開始搜課；也可以只用星期、時段或通識類別篩選。</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-base-content/80">沒有符合的課。試試別的關鍵字，或放寬星期與時段。</p>
      ) : (
        <>
          <p className="text-sm text-base-content/80" aria-live="polite">找到 {results.length} 門</p>
          <ul className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
            {results.slice(0, shown).map((course) => {
              const key = toScheduleCourse(course).key;
              const scheduled = scheduledKeys.has(key);
              const candidate = candidateKeys.has(key);
              const open = expanded === key;
              const detailsId = `details-${key.replace(':', '-')}`;
              return (
                <li key={key}>
                  <article className="rounded-field border border-base-300 bg-base-100 p-3">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailsId}
                      onClick={() => setExpanded(open ? null : key)}
                      className="flex w-full items-start gap-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <h3 className="font-medium leading-snug">{course.title}</h3>
                        <span className="mt-0.5 block text-sm text-base-content/80">
                          <span className="tabular">{course.code}</span> · {course.teacher || '教師未定'} · {candidateScheduleSummary(toScheduleCourse(course), DAY_LABELS)} · <span className="tabular">{formatCredits(course.credits)}</span>
                        </span>
                      </span>
                      <ChevronDown className={`mt-1 size-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CourseTags course={course} />
                      <div className="ml-auto flex gap-1.5">
                        {!scheduled && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm min-h-11 gap-1 border border-base-300"
                            aria-label={`加入候選：${course.title}`}
                            onClick={() => onCandidate(course)}
                          >
                            {candidate ? <Check className="size-4" aria-hidden="true" /> : <BookmarkPlus className="size-4" aria-hidden="true" />}
                            {candidate ? '已在候選' : '候選'}
                          </button>
                        )}
                        {scheduled ? (
                          <button type="button" className="btn btn-sm min-h-11 gap-1 border border-base-300 bg-base-100" aria-label={`移出課表：${course.title}`} onClick={() => onRemove(course)}>
                            <Minus className="size-4" aria-hidden="true" />
                            移出
                          </button>
                        ) : (
                          <button type="button" className="btn btn-primary btn-sm min-h-11 gap-1" aria-label={`加入課表：${course.title}`} onClick={() => onAdd(course)}>
                            <Plus className="size-4" aria-hidden="true" />
                            加入
                          </button>
                        )}
                      </div>
                    </div>
                    {open && <CourseDetails course={course} id={detailsId} />}
                  </article>
                </li>
              );
            })}
          </ul>
          {results.length > shown && (
            <button type="button" className="btn btn-ghost min-h-11 border border-base-300" onClick={() => setShown(shown + PAGE)}>
              再顯示 {Math.min(PAGE, results.length - shown)} 門
            </button>
          )}
        </>
      )}
    </div>
  );
}
