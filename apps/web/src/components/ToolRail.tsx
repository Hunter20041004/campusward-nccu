import { Download, GraduationCap, Heart, Search, SlidersHorizontal } from 'lucide-react';

export type Tool = 'search' | 'candidates' | 'conditions' | 'data' | 'graduation';

export const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: 'search', label: '課程搜尋', icon: <Search className="size-5" aria-hidden="true" /> },
  { id: 'candidates', label: '候選', icon: <Heart className="size-5" aria-hidden="true" /> },
  { id: 'conditions', label: '條件', icon: <SlidersHorizontal className="size-5" aria-hidden="true" /> },
  { id: 'data', label: '匯出與資料', icon: <Download className="size-5" aria-hidden="true" /> },
  { id: 'graduation', label: '畢業缺口', icon: <GraduationCap className="size-5" aria-hidden="true" /> },
];

/** 桌機最右側的圖示列：切換右側面板的內容（預設搜課）；模擬課表固定在左邊。 */
export function ToolRail({ tool, tools, onTool }: { tool: Tool; tools: readonly Tool[]; onTool: (tool: Tool) => void }) {
  return (
    <nav aria-label="工具" className="hidden md:block">
      <ul className="sticky top-20 flex flex-col items-center gap-3 py-2">
        {TOOLS.filter(({ id }) => tools.includes(id)).map(({ id, label, icon }) => (
          <li key={id}>
            <button
              type="button"
              aria-pressed={tool === id}
              aria-label={label}
              title={label}
              onClick={() => onTool(id)}
              className={`btn min-h-12 min-w-12 rounded-2xl px-0 ${tool === id ? 'tab-selected text-mist-ink' : 'text-base-content/70'}`}
            >
              {icon}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
