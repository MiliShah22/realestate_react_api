/** Stored as integer paise; formatted as Indian Rupee display strings. */
export function formatPaiseToInr(paise) {
  if (paise == null) return null;
  const rupees = paise / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (rupees >= 100000)   return `₹${(rupees / 100000).toFixed(2).replace(/\.00$/, '')} L`;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

/** Normalizes { page, pageSize } into a safe Knex offset/limit pair. */
export function paginationArgs(pagination) {
  const page = Math.max(1, pagination?.page || 1);
  const pageSize = Math.min(100, Math.max(1, pagination?.pageSize || 20));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

export function buildPageInfo({ page, pageSize, totalCount }) {
  return {
    totalCount,
    page,
    pageSize,
    hasNextPage: page * pageSize < totalCount,
  };
}
