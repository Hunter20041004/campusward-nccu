import { formatTargetGroup } from '@campusward/engine';

const firstSentence = (text: string) => text.split(/[。；;\n]/).map((part) => part.trim()).find(Boolean) ?? '';

/** 課名下方的小字：開課班級＋修課限制第一句，例「經濟二・經濟系、地政系學生優先」。搜課列表與「換一班」共用。 */
export const offeringLine = (course: { official: { targetGroup: string }; restrictionText: string }) =>
  [formatTargetGroup(course.official.targetGroup), firstSentence(course.restrictionText)].filter(Boolean).join('・');
