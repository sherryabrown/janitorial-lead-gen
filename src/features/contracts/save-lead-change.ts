// A confirmed write stays successful even when its follow-up read fails.
export async function saveLeadChange<T>(options: {
  write: () => Promise<T>;
  commit: (result: T) => void;
  refresh: () => Promise<unknown>;
  onRefreshError: () => void;
}): Promise<T> {
  const result = await options.write();
  options.commit(result);
  try { await options.refresh(); }
  catch { options.onRefreshError(); }
  return result;
}
