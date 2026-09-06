type RecordItem = { id: string; title?: string };
export type PlannerSnapshot = {
  plansByDate: Record<string, (RecordItem & { date: string })[]>;
  complexProjects: RecordItem[];
  deletedItemIds: string[];
  moodBook: Record<string, (RecordItem & { date: string })[]>;
  reflectionBook: Record<string, unknown>;
  reflectionVault: { protectedDates?: string[] } | null;
  customCategories: unknown;
  userProfile: unknown;
};

export function sameSnapshot(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>; const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter(k => left[k] !== undefined);
  return keys.length === Object.keys(right).filter(k => right[k] !== undefined).length && keys.every(k => sameSnapshot(left[k], right[k]));
}

export class SyncConflict extends Error {
  constructor(public names: string[]) { super(`两端同时修改了：${names.join('、')}。本机记录已保留，请先处理冲突。`); }
}

// Record-level three-way merge does not use either device's clock to pick a winner.
export function mergePlannerSnapshot<T extends PlannerSnapshot>(base: T, local: T, remote: T): T {
  const conflicts: string[] = [];
  function choose<V>(b: V, l: V, r: V, name: string): V {
    if (sameSnapshot(l, b)) return r;
    if (sameSnapshot(r, b) || sameSnapshot(l, r)) return l;
    conflicts.push(name); return r;
  }
  function records<V extends RecordItem>(b: V[], l: V[], r: V[], deleted: Set<string>): V[] {
    const index = (values: V[]) => {
      const map = new Map<string, V>();
      for (const item of values) {
        if (map.has(item.id) && !sameSnapshot(map.get(item.id), item)) conflicts.push(item.title || item.id);
        map.set(item.id, item);
      }
      return map;
    };
    const bm = index(b); const lm = index(l); const rm = index(r);
    return [...new Set([...bm.keys(), ...lm.keys(), ...rm.keys()])].flatMap(id => {
      const name = lm.get(id)?.title || rm.get(id)?.title || id;
      if (deleted.has(id)) {
        if (!base.deletedItemIds.includes(id) && (
          (local.deletedItemIds.includes(id) && rm.has(id) && !sameSnapshot(bm.get(id), rm.get(id))) ||
          (remote.deletedItemIds.includes(id) && lm.has(id) && !sameSnapshot(bm.get(id), lm.get(id)))
        )) conflicts.push(name);
        return [];
      }
      const value = choose(bm.get(id), lm.get(id), rm.get(id), name);
      return value ? [value] : [];
    });
  }
  const protectedOn = (data: T, date: string) => !!data.reflectionVault && (!data.reflectionVault.protectedDates || data.reflectionVault.protectedDates.includes(date));
  const out = { ...remote };
  const deleted = new Set([...base.deletedItemIds, ...local.deletedItemIds, ...remote.deletedItemIds]);
  out.deletedItemIds = [...deleted];
  out.plansByDate = {};
  records(Object.values(base.plansByDate).flat(), Object.values(local.plansByDate).flat(), Object.values(remote.plansByDate).flat(), deleted)
    .forEach(t => (out.plansByDate[t.date] ||= []).push(t));
  out.complexProjects = records(base.complexProjects, local.complexProjects, remote.complexProjects, deleted);
  out.moodBook = {};
  records(Object.values(base.moodBook).flat(), Object.values(local.moodBook).flat(), Object.values(remote.moodBook).flat(), new Set())
    .forEach(m => (out.moodBook[m.date] ||= []).push(m));
  out.reflectionBook = {};
  for (const date of new Set([...Object.keys(base.reflectionBook), ...Object.keys(local.reflectionBook), ...Object.keys(remote.reflectionBook)])) {
    if ((!sameSnapshot(base.reflectionBook[date], local.reflectionBook[date]) && protectedOn(remote, date) && !protectedOn(base, date)) ||
        (!sameSnapshot(base.reflectionBook[date], remote.reflectionBook[date]) && protectedOn(local, date) && !protectedOn(base, date))) conflicts.push(`${date}日志保护状态`);
    const entry = choose(base.reflectionBook[date], local.reflectionBook[date], remote.reflectionBook[date], `${date}反思日志`);
    if (entry) out.reflectionBook[date] = entry;
  }
  out.reflectionVault = choose(base.reflectionVault, local.reflectionVault, remote.reflectionVault, '加密日志');
  out.customCategories = choose(base.customCategories, local.customCategories, remote.customCategories, '分类');
  out.userProfile = choose(base.userProfile, local.userProfile, remote.userProfile, '个人资料');
  // Preserve fields introduced by another client instead of silently dropping them.
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    if (['plansByDate', 'complexProjects', 'deletedItemIds', 'moodBook', 'reflectionBook', 'reflectionVault', 'customCategories', 'userProfile'].includes(key)) continue;
    const k = key as keyof T;
    const value = choose(base[k], local[k], remote[k], key);
    if (value === undefined) delete out[k]; else out[k] = value;
  }
  if (conflicts.length) throw new SyncConflict([...new Set(conflicts)]);
  for (const date of Object.keys(out.reflectionBook)) if (protectedOn(out, date)) delete out.reflectionBook[date];
  return out;
}
