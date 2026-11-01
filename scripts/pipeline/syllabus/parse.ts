// 課綱頁解析（計畫 4.5 第 3 節）：以官方範本自己的區塊標題（h2/h3 內直接帶 span.Zh）切區塊，
// 不靠純文字比對，老師在內文自己寫的 <h2> 或相鄰區塊改字都不會吃掉後面的區塊。
// 只保留白名單：課名、課程簡介、課程目標、評量、先修科目、每週主題（沒有週次表時保留每週進度原文）。
// Office Hours、助教、附件、連結等區塊整段不收。這裡只解析，去個資在 corpus.ts。

import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

export interface WeekTopic {
  week: number;
  topic: string;
}

export interface SyllabusFields {
  title: string;
  description: string;
  objectives: string;
  grading: string;
  prerequisite: string;
  weekly: WeekTopic[];
  weeklyText: string;
}

export type ParseResult = { status: 'ok'; fields: SyllabusFields } | { status: 'notUploaded' };

const H_DESCRIPTION = '課程簡介';
const H_OBJECTIVES = '課程目標與學習成效';
const H_WEEKLY = '每周課程進度與作業要求';
const H_GRADING = '評量工具與策略、評分標準成效';
const KNOWN = [H_DESCRIPTION, H_OBJECTIVES, H_WEEKLY, H_GRADING];
const TITLE_SECTION = '#title';
/** 找週次表時不看的區塊：書目（常有編號清單）、課名區（含授課教師）、Office Hours、助教、連結、附件。 */
const NEVER_WEEKLY = /書目|^#title$|officehours|助理|助教|連結|附件/i;

const EMPTY_PREREQUISITE = new Set(['無', '無資料', 'n/a', 'none', '-', '—']);

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

// ---------- 週次 ----------

const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function chineseNumber(text: string): number | null {
  const match = /^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(text);
  if (!match || !text) return null;
  const [, tens, ten, ones] = match;
  if (!ten) return tens && !ones ? CN_DIGITS[tens]! : null;
  return (tens ? CN_DIGITS[tens]! : 1) * 10 + (ones ? CN_DIGITS[ones]! : 0);
}

const WEEK_ARABIC = /^\s*(?:week|wk\.?|w\.?|session|class|lecture|第)?\s*(\d{1,2})\s*(?:週|周|[.、:：(（)）*]|$|\s)/i;
const WEEK_CHINESE = /^\s*第?\s*([一二三四五六七八九十]{1,3})\s*(?:週|周)?\s*(?:[.、:：(（]|$|\s)/;
const NUMERIC_DATE = /^\s*\d{1,2}\s*[/／\-.]\s*\d{1,2}/;
const MONTH_DATE = /^\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}(?!\d)/i;
/** 整格只有日期（可帶星期括號），例如 9/15、10/6(一)。 */
const DATE_CELL = /^\s*\d{1,2}\s*[/／\-.]\s*\d{1,2}\s*(?:[(（][^)）]*[)）])?\s*$/;

/** 明確寫出的週次（第一週、第1週、Week 2、W.1、Session 3、純數字）；日期不算。 */
function weekLabel(text: string): number | null {
  const arabic = WEEK_ARABIC.exec(text);
  if (arabic) return Number(arabic[1]);
  const chinese = WEEK_CHINESE.exec(text);
  return chinese ? chineseNumber(chinese[1]!) : null;
}

const isDate = (text: string) => NUMERIC_DATE.test(text) || MONTH_DATE.test(text);

/** 週次欄 → 第幾週；只有日期的列以順序（ordinal）當週次；不是週次回傳 null。 */
export function weekNumber(cell: string, ordinal: number): number | null {
  const text = cell.normalize('NFKC').trim();
  if (!text) return null;
  return weekLabel(text) ?? (isDate(text) ? ordinal : null);
}

// ---------- 文字 ----------

export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\r/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .trim();
}

const isElement = (node: AnyNode): node is Element => node.type === 'tag' || node.type === 'script' || node.type === 'style';
const children = (node: AnyNode): AnyNode[] => ('children' in node ? (node.children as AnyNode[]) : []);

/** 節點底下的文字：區塊元素與 <br> 換行，其餘原始碼空白視為一個空格（同瀏覽器）；<pre> 保留換行。 */
function textOf(node: AnyNode, skipTables = false, inPre = false): string {
  if (node.type === 'text') {
    const data = (node as unknown as { data: string }).data;
    return inPre ? data : data.replace(/\s+/g, ' ');
  }
  if (!isElement(node)) return children(node).map((child) => textOf(child, skipTables, inPre)).join('');
  if (node.name === 'br') return '\n';
  if (skipTables && node.name === 'table') return '\n';
  const pre = inPre || node.name === 'pre';
  const inner = children(node).map((child) => textOf(child, skipTables, pre)).join('');
  return BLOCK.has(node.name) ? `\n${inner}\n` : inner;
}

const oneLine = (node: AnyNode) => normalizeText(textOf(node)).replace(/\n+/g, ' ');

function directRows(table: Element): Element[][] {
  const rows: Element[][] = [];
  const visit = (node: AnyNode) => {
    for (const child of children(node)) {
      if (!isElement(child) || child.name === 'table') continue;
      if (child.name === 'tr') rows.push(children(child).filter((cell): cell is Element => isElement(cell) && (cell.name === 'td' || cell.name === 'th')));
      else visit(child);
    }
  };
  visit(table);
  return rows;
}

function tableText(tables: readonly Element[]): string {
  return tables
    .flatMap((table) => directRows(table).map((cells) => cells.map(oneLine).filter(Boolean).join(' | ')))
    .filter(Boolean)
    .join('\n');
}

function weekRows(table: Element): WeekTopic[] {
  const rows: WeekTopic[] = [];
  for (const cells of directRows(table)) {
    const texts = cells.map((cell) => oneLine(cell).normalize('NFKC'));
    if (texts.length < 2) continue;
    let week: number | null;
    let rest: string[];
    const second = weekLabel(texts[1]!);
    if (isDate(texts[0]!) && second !== null && !isDate(texts[1]!)) {
      // 日期欄在前、週次欄在後（Date | WK | Topic）：以週次欄為準。
      week = second;
      rest = texts.slice(2);
    } else {
      week = weekNumber(texts[0]!, rows.length + 1);
      rest = texts.slice(1);
    }
    if (week === null) continue;
    // 主題欄空白或只是日期時，改用下一欄。
    const topic = rest.slice(0, 2).find((text) => text && !DATE_CELL.test(text)) ?? '';
    if (topic) rows.push({ week, topic });
  }
  return rows;
}

/** 表格本身與其中巢狀的表格（排版用的外框表常把週次表包在裡面）。 */
function withNested(table: Element): Element[] {
  const found: Element[] = [table];
  const visit = (node: AnyNode) => {
    for (const child of children(node)) {
      if (isElement(child) && child.name === 'table') found.push(child);
      visit(child);
    }
  };
  visit(table);
  return found;
}

/** 最大的週次表（至少 3 列）。 */
function bestWeekTable(tables: readonly Element[]): WeekTopic[] {
  let best: WeekTopic[] = [];
  for (const table of tables.flatMap(withNested)) {
    const rows = weekRows(table);
    if (rows.length >= 3 && rows.length > best.length) best = rows;
  }
  return best;
}

// ---------- 區塊 ----------

interface Section {
  prose: string;
  tables: Element[];
}

function isTemplateHeading(node: AnyNode): boolean {
  return isElement(node) && (node.name === 'h2' || node.name === 'h3')
    && children(node).some((child) => isElement(child) && child.name === 'span' && /(?:^|\s)Zh(?:\s|$)/.test(child.attribs.class ?? ''));
}

function headingName(heading: Element): string {
  const zh = children(heading).find((child): child is Element => isElement(child) && child.name === 'span' && /(?:^|\s)Zh(?:\s|$)/.test(child.attribs.class ?? ''))!;
  if (zh.attribs.id === 'CourseName') return TITLE_SECTION;
  return normalizeText(textOf(zh)).replace(/\s+/g, '').replace(/週/g, '周');
}

/** 文件順序走一遍：每個範本標題到下一個範本標題之間的節點屬於該區塊（標題自己的內容不算）。 */
function collectSections(root: AnyNode): Map<string, Section> {
  const sections = new Map<string, Section>();
  let current: { name: string; parts: string[]; tables: Element[] } | null = null;
  const finish = () => {
    if (current && !sections.has(current.name)) {
      sections.set(current.name, { prose: normalizeText(current.parts.join('')), tables: current.tables });
    }
  };
  const visit = (node: AnyNode, inPre: boolean) => {
    if (isTemplateHeading(node)) {
      finish();
      current = { name: headingName(node as Element), parts: [], tables: [] };
      return;
    }
    if (node.type === 'text') {
      if (current) current.parts.push(textOf(node, true, inPre));
      return;
    }
    if (!isElement(node)) {
      for (const child of children(node)) visit(child, inPre);
      return;
    }
    if (node.name === 'table') {
      if (current) {
        current.tables.push(node);
        current.parts.push('\n');
      }
      return;
    }
    if (node.name === 'br') {
      current?.parts.push('\n');
      return;
    }
    const block = BLOCK.has(node.name);
    if (block) current?.parts.push('\n');
    for (const child of children(node)) visit(child, inPre || node.name === 'pre');
    if (block) current?.parts.push('\n');
  };
  visit(root, false);
  finish();
  return sections;
}

// ---------- 主程式 ----------

const decoder = new TextDecoder('utf-8', { fatal: true });

export function parseSyllabus(bytes: Uint8Array): ParseResult {
  let html: string;
  try {
    html = decoder.decode(bytes);
  } catch {
    return { status: 'notUploaded' }; // 「尚未上傳」頁是 Big5
  }
  const $ = cheerio.load(html);
  $('script, style, noscript, template').remove();
  const removeComments = (node: AnyNode) => {
    for (const child of [...children(node)]) {
      if (child.type === 'comment' || child.type === 'directive') $(child).remove();
      else removeComments(child);
    }
  };
  removeComments($.root()[0]!);

  const sections = collectSections($.root()[0]!);
  if (!KNOWN.some((name) => sections.has(name)) && !$('#CourseName').length) return { status: 'notUploaded' };

  const title = [$('#CourseName').first(), $('#CourseNameEn').first()]
    .map((element) => (element.length ? oneLine(element[0]!) : ''))
    .filter(Boolean)
    .join(' ');

  const prerequisiteText = $('li > span.Zh').toArray().map(oneLine).find((text) => text.startsWith('先修科目')) ?? '';
  const prerequisiteValue = prerequisiteText.replace(/^先修科目\s*[:：]?\s*/, '').trim();
  const prerequisite = EMPTY_PREREQUISITE.has(prerequisiteValue.toLowerCase()) ? '' : prerequisiteValue;

  const section = (name: string): Section => sections.get(name) ?? { prose: '', tables: [] };
  const grading = section(H_GRADING);
  const weeklySection = section(H_WEEKLY);

  let weekly = bestWeekTable(weeklySection.tables);
  if (!weekly.length) {
    const elsewhere = [...sections].filter(([name]) => name !== H_WEEKLY && !NEVER_WEEKLY.test(name)).flatMap(([, { tables }]) => tables);
    weekly = bestWeekTable(elsewhere);
  }
  const join = (prose: string, tables: readonly Element[]) => normalizeText([prose, tableText(tables)].filter(Boolean).join('\n'));

  return {
    status: 'ok',
    fields: {
      title,
      description: section(H_DESCRIPTION).prose,
      objectives: section(H_OBJECTIVES).prose,
      grading: join(grading.prose, grading.tables),
      prerequisite,
      weekly,
      weeklyText: weekly.length ? '' : join(weeklySection.prose, weeklySection.tables),
    },
  };
}
