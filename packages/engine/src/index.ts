// Campusward 引擎公開介面：純邏輯，畫面與資料管線都從這裡引用。
export const ENGINE_NAME = 'campusward-engine';

export * from './periods.ts';
export * from './term.ts';
export * from './official/url.ts';
export * from './official/syllabus.ts';
export * from './official/notes.ts';
export * from './official/course.ts';
export * from './official/corrections.ts';
export * from './eligibility.ts';
export * from './schedule/selection.ts';
export * from './schedule/catalog.ts';
export * from './schedule/agenda.ts';
export * from './internship.ts';
export * from './catalog.ts';
export * from './rules.ts';
export * from './plans.ts';
export * from './history.ts';
export * from './ai/validate.ts';
export * from './ai/changeSet.ts';
export * from './ai/import.ts';
export * from './ai/plan.ts';
export * from './storage.ts';
