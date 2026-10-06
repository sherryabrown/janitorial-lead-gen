export function stateListingArgs(args) {
  const [code, runId, flag] = args;
  if (!['state-intents','state-other'].includes(code) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId ?? '') ||
      args.length < 2 || args.length > 3 || (flag !== undefined && flag !== '--apply'))
    throw new Error('Usage: node scripts/verify-state-listing.mjs state-intents|state-other RUN_UUID [--apply]');
  return {code, runId, flag};
}
