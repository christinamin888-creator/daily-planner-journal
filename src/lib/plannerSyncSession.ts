import { mergePlannerSnapshot, sameSnapshot, type PlannerSnapshot } from '../../shared/plannerSync';

export type SyncCheckpoint<T> = { base: T; local: T };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const checkpointKey = (userId: string) => `daily-planner-sync-v2:${userId}`;

export function acquireSyncWindow(locks: LockManager | undefined, userId: string): Promise<() => void> {
  if (!locks) return Promise.reject(new Error('此浏览器不支持安全窗口锁，请更新浏览器后再同步。'));
  return new Promise((resolve, reject) => {
    void locks.request(`daily-planner-writer:${userId}`, { ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error('此账号已在另一个网站窗口中打开，请关闭那个窗口后重新读取。')); return; }
      await new Promise<void>(release => resolve(release));
    }).catch(reject);
  });
}

export function readCheckpoint<T>(storage: Storage, userId: string): SyncCheckpoint<T> | null {
  const raw = storage.getItem(checkpointKey(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as SyncCheckpoint<T>;
  const valid = (item: unknown) => !!item && typeof item === 'object' && !Array.isArray(item)
    && 'plansByDate' in item && 'deletedItemIds' in item;
  if (!valid(value?.base) || !valid(value?.local)) throw new Error('本机同步记录损坏，请先备份，不要清除浏览器数据。');
  return value;
}

export function writeCheckpoint<T>(storage: Storage, userId: string, value: SyncCheckpoint<T>): void {
  storage.setItem(checkpointKey(userId), JSON.stringify(value));
}

export type SyncDriver<T> = {
  read: (userId: string) => Promise<unknown>;
  save: (userId: string, expected: unknown, next: T) => Promise<void>;
  normalize: (raw: unknown) => T;
  current: () => T;
  apply: (next: T) => void;
  persist: (checkpoint: SyncCheckpoint<T>) => void;
  active: () => boolean;
};

export class PlannerSyncSession<T extends PlannerSnapshot> {
  private base: T;
  private pending = false;
  constructor(readonly userId: string, checkpoint: SyncCheckpoint<T>, private driver: SyncDriver<T>) {
    this.base = checkpoint.base;
  }
  persistLocal() { this.driver.persist({ base: this.base, local: this.driver.current() }); }
  async sync(): Promise<'saved' | 'pending' | 'cancelled' | 'busy'> {
    if (this.pending) return 'busy';
    this.pending = true;
    try {
      const raw = await this.driver.read(this.userId);
      if (!this.driver.active()) return 'cancelled';
      const remote = this.driver.normalize(raw);
      const submitted = this.driver.current();
      const merged = mergePlannerSnapshot(this.base, submitted, remote);
      // Fail before a network write if the local checkpoint cannot be retained.
      this.driver.persist({ base: this.base, local: submitted });
      if (!sameSnapshot(merged, remote)) await this.driver.save(this.userId, raw, merged);
      if (!this.driver.active()) return 'cancelled';
      // Edits made while the save was pending must survive the response.
      const current = this.driver.current();
      const next = mergePlannerSnapshot(submitted, current, merged);
      this.driver.persist({ base: merged, local: next });
      this.base = merged;
      this.driver.apply(next);
      return sameSnapshot(next, merged) ? 'saved' : 'pending';
    } finally {
      this.pending = false;
    }
  }
}
