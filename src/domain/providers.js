// Provider contract: fetchComparables(query) -> {listings, fetchedAt, source}.
// A failed attempt must not overwrite lastSuccessAt or cached data.
export const olxProvider = {
  id: "olx-kz",
  available: false,
  async fetchComparables() {
    throw new Error("Доступ к разрешённому поисковому API OLX не подтверждён");
  },
};
export async function refreshProvider(provider, status, query) {
  try {
    const result = await provider.fetchComparables(query);
    return {
      ...status,
      data: result.listings,
      lastSuccessAt: result.fetchedAt,
      error: null,
    };
  } catch (e) {
    return {
      ...status,
      lastAttemptAt: new Date().toISOString(),
      error: e.message,
    };
  }
}
