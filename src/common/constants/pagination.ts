export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export function clampPagination(page?: number, limit?: number) {
  const safePage = page != null && page >= 1 ? page : 1;
  const safeLimit =
    limit != null && limit >= 1
      ? Math.min(limit, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return { page: safePage, limit: safeLimit };
}
