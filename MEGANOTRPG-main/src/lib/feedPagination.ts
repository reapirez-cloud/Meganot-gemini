export type FeedCursor = {
  published_at: string
  id: string
}

export type FeedOrderable = FeedCursor

export function compareFeedOrder(a: FeedOrderable, b: FeedOrderable) {
  const byDate = b.published_at.localeCompare(a.published_at)
  return byDate || b.id.localeCompare(a.id)
}

export function feedCursorFilter(cursor: FeedCursor) {
  return `published_at.lt.${cursor.published_at},and(published_at.eq.${cursor.published_at},id.lt.${cursor.id})`
}
