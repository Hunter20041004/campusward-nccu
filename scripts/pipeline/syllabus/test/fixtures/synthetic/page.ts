// 合成課綱頁：模仿官方範本的結構（h2/h3 內直接帶 span.Zh 的區塊標題、#CourseName、li > span.Zh 的先修科目、
// 版本註解、script），內容全部是虛構的。不得放入真實課綱頁、教師姓名或聯絡方式。

export interface PageOptions {
  titleZh?: string;
  titleEn?: string;
  prerequisite?: string;
  description?: string;
  objectives?: string;
  /** 每周課程進度區塊內的 HTML（表格或文字）。 */
  weekly?: string;
  grading?: string;
  bibliography?: string;
  officeHours?: string;
  assistant?: string;
  links?: string;
  attachments?: string;
  /** 插在授課方式區塊內的額外 HTML。 */
  teaching?: string;
}

const heading = (tag: 'h2' | 'h3', zh: string, en: string) =>
  `<${tag} class="text-primary text-center"><span class="Zh">${zh}</span><span class="En">${en}</span></${tag}><!--2017.6.21-->`;

const section = (inner: string) =>
  `<div class="container-fluid sylview-section"><div class="row"><div class="col-md-8">${inner}</div></div><!--/.row!--></div><!--/.container!-->`;

export function syllabusPage(options: PageOptions = {}): string {
  const {
    titleZh = '測試課程導論',
    titleEn = 'Introduction to Testing',
    prerequisite = '無',
    description = '<p>本課程介紹測試的基本觀念。</p>',
    objectives = '<p>學生能寫出可重現的測試。</p>',
    weekly = '',
    grading = '<p>期中報告 40%</p><p>期末考 60%</p>',
    bibliography = '<p>測試入門（2020）。</p>',
    officeHours = '<p>週三 10:00-12:00 研究室 000 室</p>',
    assistant = '<p>助教：測試助教</p>',
    links = '<pre>https://example.com/course</pre>',
    attachments = '<ul class="list-group"><li>大綱.pdf</li></ul>',
    teaching = '',
  } = options;
  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>課程大綱</title>
<style>.Zh { color: red; } /* 樣式不應被收錄 */</style>
<script>var secret = "不應被收錄的腳本";</script></head>
<body>
<div class="container">
  <h2><span class="visible-print visible-print-inline">科目名稱：</span><span class="Zh" id="CourseName">${titleZh}   </span></h2><!--2017.05.03-->
  <h5><span class="visible-print visible-print-inline">Course Name: </span><span class="En" id="CourseNameEn">${titleEn}</span></h5><!--2017.05.03-->
  <ul>
    <li><span class="Zh">授課教師：測試教師</span><span class="En">Instructor: Test Teacher</span></li>
    <li><span class="Zh">先修科目：${prerequisite}</span><span class="En">Prerequisite</span></li>
  </ul>
</div>
${section(`${heading('h2', '課程簡介', 'Course Description')}<div class="col-p-8"><!--2017.6.21-->${description}</div>
  ${heading('h3', '核心能力分析圖', 'Core Competence Analysis Chart')}<div id="chart"></div>`)}
${section(`${heading('h2', '課程目標與學習成效', 'Course Objectives &amp; Learning Outcomes')}<div class="col-p-8">${objectives}</div>`)}
${section(`${heading('h2', '課程屬性', 'Course Characteristics')}<table class="table"><tr><td>人文關懷課程</td><td>4</td></tr><tr><td>跨領域課程</td><td>3</td></tr><tr><td>總整課程</td><td>1</td></tr></table>`)}
${section(`${heading('h2', '每周課程進度與作業要求', ' Course Schedule &amp; Requirements')}${weekly}`)}
${section(`${heading('h2', '授課方式', 'Teaching Approach')}<div><i>30%</i><h4><span class="Zh">講述</span><span class="En">Lecture</span></h4></div>${teaching}`)}
${section(`${heading('h2', '評量工具與策略、評分標準成效', 'Evaluation Criteria')}<div class="col-p-8">${grading}</div>`)}
${section(`${heading('h2', '指定/參考書目', 'Textbook &amp; References')}<div class="col-p-8">${bibliography}</div>`)}
${section(`${heading('h2', '本課程可否使用生成式AI工具', 'Course Policies on the Use of Generative AI Tools')}<span class="Zh">本課程無涉及AI使用</span>`)}
${section(`${heading('h3', '課程相關連結', 'Course Related Links')}${links}
  ${heading('h3', '課程附件', 'Course Attachments')}${attachments}`)}
${section(`${heading('h3', '授課教師Office Hours及地點', 'Office Hours &amp; Office Location')}${officeHours}
  ${heading('h3', '教學助理基本資料', 'Teaching Assistant Information')}${assistant}`)}
<footer><p>國立政治大學 版權所有</p></footer>
<script>$("#CourseName").html();</script>
</body></html>`;
}

/** 官方範本常見的週次表：週次／主題／內容／作業。 */
export function weekTable(rows: readonly (readonly string[])[], header = ['週次', '課程主題', '課程內容與指定閱讀', '教學活動與作業']): string {
  const head = header.length ? `<thead><tr>${header.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>` : '';
  return `<table class="table">${head}<tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('\n')}</tbody></table>`;
}

/** 尚未上傳課綱的頁面是 Big5 編碼；這裡用「尚未上傳」的 Big5 位元組組出一頁非 UTF-8 內容。 */
export function big5NotUploadedPage(): Uint8Array {
  const prefix = new TextEncoder().encode('<html><head><meta charset="big5"></head><body><p>');
  // 「尚未上傳」的 Big5：A9 7C A5 BC A4 57 B6 C7
  const body = Uint8Array.from([0xa9, 0x7c, 0xa5, 0xbc, 0xa4, 0x57, 0xb6, 0xc7]);
  const suffix = new TextEncoder().encode('</p></body></html>');
  return Uint8Array.from([...prefix, ...body, ...suffix]);
}
