import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<string | undefined>();

export function runWithBranch<T>(branchId: string | undefined, callback: () => T): T {
  return storage.run(branchId, callback);
}

export function getCurrentBranchId(): string | undefined {
  return storage.getStore();
}
