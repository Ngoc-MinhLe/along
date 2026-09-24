import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listNews } from '../services/news'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN')
}

function accessLabel(item) {
  if (item.accessMode === 'VIP') return `VIP ${item.accessLevel}`
  return item.accessMode || 'PUBLIC'
}

export default function NewsListPage() {
  const [items, setItems] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadNews = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listNews({ categoryId: categoryId.trim() || null, limit: 20 })
      setItems(result.items || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [categoryId])

  useEffect(() => { loadNews() }, [loadNews])

  return <section className="page-section news-page">
    <div className="page-title-row"><div><p className="eyebrow">MODULE 2 · NEWS</p><h2>Tin tức</h2><p className="lead">Các bài viết đã xuất bản, được lọc theo chính sách truy cập hiện tại của tài khoản.</p></div></div>
    <section className="news-toolbar">
      <label>Category ID (tùy chọn)<input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} placeholder="Lọc theo category ID" /></label>
      <button className="secondary-button" type="button" onClick={loadNews} disabled={loading}>Tải lại</button>
    </section>
    {error && <p className="error-message" role="alert">{error}</p>}
    {loading && <p className="inline-status">Đang tải tin tức…</p>}
    {!loading && !items.length && <div className="empty-state"><span>◌</span><h3>Chưa có bài viết phù hợp</h3><p>Bài chưa xuất bản hoặc nội dung không thuộc quyền truy cập sẽ không được trả về.</p></div>}
    {!loading && items.length > 0 && <div className="news-card-grid">{items.map((item) => <article className="news-card" key={item.id}>
      <div className="news-card-meta"><span>{accessLabel(item)}</span><time>{formatDate(item.publishedAt)}</time></div>
      <h3>{item.title}</h3>
      <p>{item.excerpt || 'Không có mô tả.'}</p>
      <Link className="card-link" to={`/tin-tuc/${item.id}`}>Đọc bài viết →</Link>
    </article>)}</div>}
  </section>
}
