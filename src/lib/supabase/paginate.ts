/**
 * Récupère toutes les lignes d'une requête Supabase en paginant par blocs
 * (nécessaire car PostgREST plafonne les résultats à 1000 lignes par requête).
 *
 * Usage :
 *   const rows = await fetchAllPaginated<Transaction>((from, to) =>
 *     supabase.from('transactions').select('*').eq('user_id', userId).range(from, to)
 *   )
 */
export async function fetchAllPaginated<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data: page, error } = await queryFn(from, from + pageSize - 1)
    if (error) {
      console.error('[fetchAllPaginated] erreur de pagination :', error.message)
      break
    }
    if (!page || page.length === 0) break
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
}
