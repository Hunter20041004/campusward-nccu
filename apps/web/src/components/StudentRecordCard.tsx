import { parseStudentExport, satisfiedPrerequisiteIds, toScheduleCourse, type Course, type IdentityProfile, type StudentRecord } from '@campusward/engine';
import { FileUp, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface StudentRecordCardProps {
  record: StudentRecord | null;
  onRecord: (record: StudentRecord | null) => void;
  /** 本學期課程：找出已通過的課符合哪些擋修條件。 */
  courses: readonly Course[];
  profile: IdentityProfile;
  onProfile: (profile: IdentityProfile) => void;
}

const action = 'btn btn-sm min-h-11 gap-1.5';
const LEVEL = { undergrad: '學士班', graduate: '碩博士班' } as const;
const ADDITIONAL = { none: '沒有加修', minor: '輔系', double: '雙主修' } as const;
const YEAR = ['一', '二', '三', '四', '五', '六', '七'];

/**
 * 全人系統資料（2026-11-01 使用者要求匯入一次、各功能共用）：條件（身分、擋修）、重修提醒、搜課「已修過」、畢業缺口都讀這一份。
 * 原始檔讀完即丟，只留白名單解析結果；存在這台瀏覽器，不送 AI、不進匯出檔，清除本機資料時一起清掉。
 */
export function StudentRecordCard({ record, onRecord, courses, profile, onProfile }: StudentRecordCardProps) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const readFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    setError('');
    setMessage('');
    if (!file) return;
    const result = parseStudentExport(await file.text());
    input.value = '';
    if (result.ok) {
      onRecord(result.record);
      setMessage('已匯入。下載的原始檔含大量個資，用完請自己刪除。');
    } else {
      setError(result.error.message);
    }
  };

  const prerequisiteIds = useMemo(() => {
    if (!record) return [];
    const offered = new Set(courses.flatMap((course) => toScheduleCourse(course).eligibility.eligibilityRules?.map(({ conditionId }) => conditionId) ?? []));
    const accepted = new Set(profile.conditionIds ?? []);
    return satisfiedPrerequisiteIds(record).filter((id) => offered.has(id) && !accepted.has(id));
  }, [courses, profile.conditionIds, record]);

  const suggested = record?.suggestedProfile;
  // 只比對匯出檔看得出來的欄位；看不出年級時，不因學生自己填的年級而一直提示。
  const suggestionDiffers = suggested && (
    (suggested.level !== undefined && suggested.level !== profile.level)
    || (suggested.year !== undefined && suggested.year !== profile.year)
    || (suggested.additionalMajor !== undefined && suggested.additionalMajor !== profile.additionalMajor)
  );
  const passed = record?.courses.filter(({ result }) => result === 'passed').length ?? 0;

  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-base-content/75">
        匯入全人系統匯出的檔案一次，身分條件、擋修資格、重修提醒、搜課「已修過」與畢業缺口都會用到。只存在這台瀏覽器、不含分數，不送 AI、不放進匯出檔。
      </p>
      <div className="flex flex-wrap gap-2">
        <label className={`${action} cursor-pointer`}>
          <FileUp className="size-4" aria-hidden="true" />{record ? '重新匯入全人系統資料' : '匯入全人系統資料'}
          <input type="file" accept=".json,application/json" className="sr-only" aria-label="上傳全人系統匯出檔" onChange={(event) => void readFile(event.currentTarget)} />
        </label>
        {record && (
          <button type="button" className={action} onClick={() => { onRecord(null); setMessage('已清除匯入的修課資料。'); }}>
            <Trash2 className="size-4" aria-hidden="true" />清除修課資料
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-coral-ink">{error}</p>}
      {message && <p role="status">{message}</p>}
      {record && (
        <p className="text-xs">
          {[record.enrollment.major, record.enrollment.className].filter(Boolean).join(' · ')}
          {` · 已通過 ${passed} 門`}
          {record.audit.checkedAt && ` · 學校審查資料日期 ${record.audit.checkedAt}`}
          {record.skippedCourseRows > 0 && ` · 有 ${record.skippedCourseRows} 筆修課紀錄格式看不懂，已略過`}
        </p>
      )}
      {suggested && suggestionDiffers && (
        <div className="raised rounded-2xl px-3 py-2">
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
        <div className="raised rounded-2xl px-3 py-2">
          <p>你已通過的課符合本學期 {prerequisiteIds.length} 項擋修條件（只比對同名課）。</p>
          <button
            type="button"
            className={`${action} mt-2`}
            onClick={() => {
              onProfile({ ...profile, conditionIds: [...(profile.conditionIds ?? []), ...prerequisiteIds] });
              setMessage(`已勾選 ${prerequisiteIds.length} 項擋修條件，可在「修課資格」改回。`);
            }}
          >
            勾選這些擋修條件
          </button>
        </div>
      )}
    </div>
  );
}
