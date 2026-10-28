import { trustedNccuUrl } from './url.ts';

export interface SyllabusState {
  status: 'available' | 'not_uploaded' | 'unverified';
  url: string;
  checkedAt: string | null;
}

export function officialSyllabusState({ sourceUrl, lookupStatus, checkedAt = null }: {
  sourceUrl: unknown;
  lookupStatus: 'success' | 'error';
  checkedAt?: string | null;
}): SyllabusState {
  const url = trustedNccuUrl(sourceUrl);
  if (lookupStatus === 'success' && url) return { status: 'available', url, checkedAt };
  if (lookupStatus === 'success') return { status: 'not_uploaded', url: '', checkedAt };
  return { status: 'unverified', url: '', checkedAt };
}
