export const REQUEST_LOG_PAGE_SIZE = 10;

export function resolvePage(requestedPage: unknown, pageSize: number, total: number) {
  const size = Math.min(100, Math.max(1, Math.round(Number(pageSize)) || 1));
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotal / size));
  const raw = Number(requestedPage);
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(raw) ? Math.round(raw) : 1));
  return { page, pageSize: size, total: safeTotal, totalPages, offset: (page - 1) * size };
}
