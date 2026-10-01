export default function CursorPagination({ page = 1, hasMore = false, onPrevious, onNext, loading = false, rangeLabel = '' }) {
  return <div className="cursor-pagination">
    <span>{rangeLabel || `Trang ${page}`}</span>
    <div>
      <button type="button" className="admin-secondary-button" onClick={onPrevious} disabled={loading || page <= 1}>Trước</button>
      <span>Trang {page}</span>
      <button type="button" className="admin-secondary-button" onClick={onNext} disabled={loading || !hasMore}>Sau</button>
    </div>
  </div>
}
