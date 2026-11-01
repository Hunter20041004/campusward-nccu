import { expect, test, vi } from 'vitest';
import { clearBrowserCaches } from './browserStorage.ts';

test('clears this tab, Campusward caches and databases, and leaves other sites alone', async () => {
  const session = { clear: vi.fn() };
  const caches = { keys: vi.fn(async () => ['campusward-syllabi', 'other']), delete: vi.fn(async () => true) };
  const indexedDB = { databases: vi.fn(async () => [{ name: 'campusward-search' }, { name: 'other-db' }]), deleteDatabase: vi.fn() };
  await clearBrowserCaches({ sessionStorage: session, caches, indexedDB } as unknown as Window);
  expect(session.clear).toHaveBeenCalled();
  expect(caches.delete.mock.calls).toEqual([['campusward-syllabi']]);
  expect(indexedDB.deleteDatabase.mock.calls).toEqual([['campusward-search']]);
});

test('does not fail when the browser blocks storage', async () => {
  const blocked = { get sessionStorage(): Storage { throw new Error('blocked'); } } as unknown as Window;
  await expect(clearBrowserCaches(blocked)).resolves.toBeUndefined();
});
