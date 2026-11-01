/**
 * 一次修改最後有沒有套用：applied 已存檔；rejected 被引擎或存檔擋下（附原因）；
 * cancelled 自動備案滿了、學生在確認視窗按了取消。面板要等到 applied 才往下走或收起。
 */
export type ChangeOutcome = { status: 'applied' } | { status: 'rejected'; errors: string[] } | { status: 'cancelled' };

/** 沒有套用時給學生看的一句話；套用了是空字串。 */
export function outcomeMessage(outcome: ChangeOutcome): string {
  if (outcome.status === 'rejected') return `沒有套用：${outcome.errors.join(' ') || '這次修改沒有存檔。'}`;
  if (outcome.status === 'cancelled') return '沒有套用：自動備案已滿，你按了取消，課表沒有改。';
  return '';
}
