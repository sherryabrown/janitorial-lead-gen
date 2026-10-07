export const categoryNames = ['forecast', 'opportunity', 'award'];
const bases = { forecast: ['published','publication','expected_solicitation','expected_solicitation_date'],
  opportunity: ['published','publication','deadline'], award: ['published','publication','award_date','end_renewal','contract_end_date'] };
export function requestedCategories(request) {
  // Old requests intentionally planned all categories. New API requests are explicit.
  const selected = request.requested_categories ?? categoryNames;
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length ||
      selected.some(kind => !categoryNames.includes(kind))) throw new Error('Select valid unique categories');
  return selected;
}
export function validateRequestScope(input) {
  const categories = requestedCategories(input);
  for (const kind of categories) {
    const window = input.search_windows?.[kind];
    const valid = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
    if (!valid(window?.from) || !valid(window?.to) || window.from > window.to ||
        !bases[kind].includes(window.date_basis)) throw new Error(`Explicit valid ${kind} dates and date_basis required`);
  }
  if (!input.service_scope || input.service_scope.service !== 'janitorial') throw new Error('Routine janitorial service_scope required');
  return categories;
}
