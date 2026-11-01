// 課綱問答驗收（計畫 4.5）：30 題，每題的「相關課程」由語料本身的條件決定（課名或指定欄位含關鍵詞），
// 不靠人工判分。量前 5 門課裡有沒有相關的課（命中率），以及前 5 門裡相關課的比例（準確率）。
// npx tsx scripts/verification/syllabus-recall.ts
import { readFileSync } from 'node:fs';
import { parseSyllabusLine, type SyllabusEntry } from '../../packages/engine/src/index.ts';
import { buildSyllabusArtifacts, loadSyllabusIndex, searchSyllabi } from '../../apps/web/src/qa/syllabusIndex.ts';

type Field = 'title' | 'description' | 'objectives' | 'grading' | 'weekly';
const QUESTIONS: { question: string; phrase: string; fields: Field[] }[] = [
  ['哪些課在教機器學習？', '機器學習', ['title', 'description', 'objectives']],
  ['想學深度學習', '深度學習', ['title', 'description', 'objectives']],
  ['有教 Python 的課嗎', 'python', ['title', 'description', 'objectives', 'weekly']],
  ['財務報表分析的課', '財務報表', ['title', 'description', 'objectives']],
  ['教統計迴歸分析的課', '迴歸', ['title', 'description', 'objectives', 'weekly']],
  ['永續發展相關課程', '永續', ['title', 'description', 'objectives']],
  ['人工智慧的倫理問題', '倫理', ['title', 'description', 'objectives']],
  ['數位行銷', '數位行銷', ['title', 'description', 'objectives']],
  ['社會心理學', '社會心理', ['title', 'description', 'objectives']],
  ['國際關係理論', '國際關係', ['title', 'description', 'objectives']],
  ['區塊鏈', '區塊鏈', ['title', 'description', 'objectives', 'weekly']],
  ['資料視覺化', '視覺化', ['title', 'description', 'objectives', 'weekly']],
  ['賽局理論', '賽局', ['title', 'description', 'objectives', 'weekly']],
  ['憲法基本權', '憲法', ['title', 'description', 'objectives']],
  ['日文會話', '日語', ['title', 'description', 'objectives']],
  ['新聞採訪寫作', '採訪', ['title', 'description', 'objectives']],
  ['創業與新創', '創業', ['title', 'description', 'objectives']],
  ['供應鏈管理', '供應鏈', ['title', 'description', 'objectives', 'weekly']],
  ['台灣史', '臺灣史', ['title', 'description', 'objectives']],
  ['氣候變遷', '氣候變遷', ['title', 'description', 'objectives', 'weekly']],
  ['哪些課期末要交小組報告', '小組報告', ['grading']],
  ['哪些課有期中考', '期中考', ['grading']],
  ['出席占分數的課', '出席', ['grading']],
  ['要寫期末論文的課', '期末論文', ['grading']],
  ['有口頭報告的課', '口頭報告', ['grading']],
  ['有課堂參與分數', '課堂參與', ['grading']],
  ['有隨堂測驗的課', '小考', ['grading']],
  ['田野調查', '田野', ['description', 'objectives', 'weekly']],
  ['使用 R 語言', 'r 語言', ['description', 'objectives', 'weekly']],
  ['個案討論教學', '個案', ['description', 'objectives']],
].map(([question, phrase, fields]) => ({ question: question as string, phrase: phrase as string, fields: fields as Field[] }));

const text = (entry: SyllabusEntry, field: Field) => (field === 'weekly' ? entry.weekly.map(({ topic }) => topic).join(' ') : entry[field]).normalize('NFKC').toLowerCase();
const corpus = readFileSync('data/syllabi/1151/corpus.jsonl', 'utf8');
const entries = corpus.split('\n').filter(Boolean).map(parseSyllabusLine).filter((entry): entry is SyllabusEntry => entry !== null);
const index = loadSyllabusIndex(buildSyllabusArtifacts(corpus).index);

let hits = 0;
let precision = 0;
const rows = QUESTIONS.map(({ question, phrase, fields }) => {
  const relevant = new Set(entries.filter((entry) => fields.some((field) => text(entry, field).includes(phrase.normalize('NFKC').toLowerCase()))).map(({ code }) => code));
  const top = [...new Set(searchSyllabi(index, question, 60).map(({ code }) => code))].slice(0, 5);
  const good = top.filter((code) => relevant.has(code)).length;
  if (good) hits += 1;
  precision += top.length ? good / top.length : 0;
  return `| ${question} | ${phrase} | ${relevant.size} | ${good}/${top.length} |`;
});
console.log('| 問題 | 判定關鍵詞 | 相關課數 | 前 5 門命中 |\n|---|---|---|---|');
console.log(rows.join('\n'));
console.log(`\n命中率（前 5 門有相關課）：${hits}/${QUESTIONS.length}；平均準確率（前 5 門中相關的比例）：${(precision / QUESTIONS.length * 100).toFixed(0)}%`);
