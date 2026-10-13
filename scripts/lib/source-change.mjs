import { checked } from './hosted-store.mjs';

// Preserve "matches any saved hash" semantics without downloading capture history.
export async function savedContentChange(db,table,scope,hashColumn,hash,order='id') {
  const probe=async matching=>checked(await scope(db.from(table).select(order))
    .eq(...matching).order(order).range(0,0));
  if((await probe([hashColumn,hash])).length)return 'unchanged';
  const previous=checked(await scope(db.from(table).select(order)).order(order).range(0,0));
  return previous.length?'changed':'new';
}
