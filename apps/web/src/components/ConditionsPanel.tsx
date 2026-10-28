import {
  buildConditionDefinitions,
  buildConditionImpacts,
  calculateInternshipPlan,
  validateInternshipSettings,
  type IdentityProfile,
  type InternshipSettings,
  type Preferences,
  type ScheduleCourse,
  type ScheduleEntry,
} from '@campusward/engine';
import { useState } from 'react';
import { DAY_LABELS } from './labels.ts';

export interface ConditionsPanelProps {
  profile: IdentityProfile;
  /** 候選與課表上的課（用來找出需要確認的資格）。 */
  courses: readonly ScheduleCourse[];
  entries: readonly ScheduleEntry[];
  preferences: Preferences;
  onProfile: (profile: IdentityProfile) => void;
  onPreferences: (change: { freeDays?: number[]; internship?: InternshipSettings }) => void;
}

const without = (values: readonly string[] | undefined, value: string) => (values ?? []).filter((item) => item !== value);
const formatDays = (days: number) => (Number.isInteger(days) ? String(days) : days.toFixed(1));

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-base-300 pb-4 last:border-b-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note && <p className="text-xs text-base-content/75">{note}</p>}
      {children}
    </section>
  );
}

export function ConditionsPanel({ profile, courses, entries, preferences, onProfile, onPreferences }: ConditionsPanelProps) {
  const definitions = buildConditionDefinitions(courses.map(({ eligibility }) => eligibility));
  const impacts = buildConditionImpacts(courses.map(({ key, title, eligibility }) => ({ ...eligibility, id: key, title })), definitions, profile);
  const [targetDraft, setTargetDraft] = useState(String(preferences.internship.targetDays));
  const [targetError, setTargetError] = useState<string | null>(null);
  const internship = calculateInternshipPlan(entries, preferences.internship);

  const setCondition = (id: string, state: 'accepted' | 'rejected' | 'unknown') => onProfile({
    ...profile,
    conditionIds: state === 'accepted' ? [...without(profile.conditionIds, id), id] : without(profile.conditionIds, id),
    rejectedConditionIds: state === 'rejected' ? [...without(profile.rejectedConditionIds, id), id] : without(profile.rejectedConditionIds, id),
  });

  const changeTarget = (value: string) => {
    setTargetDraft(value);
    const settings: InternshipSettings = { ...preferences.internship, targetDays: Number(value) };
    const problem = value.trim() === '' ? { message: '每週實習目標必須是 0 到 5 天，並以半天為單位。' } : validateInternshipSettings(settings);
    setTargetError(problem?.message ?? null);
    if (!problem) onPreferences({ internship: settings });
  };

  return (
    <div className="space-y-4 overflow-y-auto">
      <Section title="我的身分" note="只有你自己能改；AI 不會改這些設定。">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span>學制</span>
            <select className="select select-sm min-h-11" value={profile.level ?? ''} onChange={(event) => onProfile({ ...profile, ...(event.target.value ? { level: event.target.value as 'undergrad' | 'graduate' } : { level: undefined }) })}>
              <option value="">未設定</option>
              <option value="undergrad">大學部</option>
              <option value="graduate">研究所</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>年級</span>
            <select className="select select-sm min-h-11" value={profile.year ?? ''} onChange={(event) => onProfile({ ...profile, ...(event.target.value ? { year: Number(event.target.value) } : { year: undefined }) })}>
              <option value="">未設定</option>
              {[1, 2, 3, 4, 5, 6, 7].map((year) => <option key={year} value={year}>{year} 年級</option>)}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span>加修學系</span>
            <select className="select select-sm min-h-11" value={profile.additionalMajor ?? 'none'} onChange={(event) => onProfile({ ...profile, additionalMajor: event.target.value as 'none' | 'minor' | 'double' })}>
              <option value="none">無</option>
              <option value="minor">輔系</option>
              <option value="double">雙主修</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="修課資格" note="依官方修課限制產生。你的回答只用來判斷能不能直接加入，實際以系所審核為準。">
        {impacts.length === 0 ? (
          <p className="text-sm text-base-content/80">目前候選課沒有需要確認的資格。</p>
        ) : (
          <ul className="space-y-2">
            {impacts.map((impact) => (
              <li key={impact.id}>
                <div role="radiogroup" aria-label={impact.label} className="rounded-field border border-base-300 bg-base-100 p-3 text-sm">
                  <p className="font-medium">{impact.label}</p>
                  <p className="text-xs text-base-content/75">{impact.summary}：{impact.affectedCourses.map(({ title }) => title).join('、')}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4">
                    {([['accepted', '我符合'], ['rejected', '我不符合'], ['unknown', '還不確定']] as const).map(([state, label]) => (
                      <label key={state} className="flex min-h-11 items-center gap-2">
                        <input type="radio" className="radio radio-sm" name={impact.id} checked={impact.state === state} onChange={() => setCondition(impact.id, state)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="偏好" note="AI 排課時會照這些偏好；你也可以隨時改。">
        <div role="group" aria-label="想空下來的日子" className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => {
            const pressed = preferences.freeDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={pressed}
                aria-label={`${DAY_LABELS[day]}空下來`}
                onClick={() => onPreferences({ freeDays: pressed ? preferences.freeDays.filter((value) => value !== day) : [...preferences.freeDays, day].sort() })}
                className={`min-h-11 min-w-11 rounded-selector border text-sm ${pressed ? 'border-mist-ink bg-primary/20 font-medium text-mist-ink' : 'border-base-300 bg-base-100'}`}
              >
                {DAY_LABELS[day]!.slice(1)}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span>每週實習天數</span>
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            inputMode="decimal"
            className="input input-sm min-h-11 w-20"
            value={targetDraft}
            aria-invalid={targetError ? 'true' : undefined}
            aria-describedby={targetError ? 'internship-error' : undefined}
            onChange={(event) => changeTarget(event.target.value)}
          />
        </label>
        {targetError && <p id="internship-error" className="text-sm text-coral-ink">{targetError}</p>}
        <p role="status" aria-label="實習空檔" className="text-sm">
          可實習 <strong className="tabular">{formatDays(internship.confirmedDays || internship.availableDays)}</strong> 天
          {internship.tentative && `（有課時間未定，${formatDays(internship.pendingDays)} 天待確認）`}
          ，{internship.meetsTarget ? '達到' : '未達'}每週 {formatDays(preferences.internship.targetDays)} 天的目標
        </p>
      </Section>
    </div>
  );
}
