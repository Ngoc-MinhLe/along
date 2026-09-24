import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getNewsArticle } from '../services/news'

export default function NewsArticlePage() {
  const { articleId } = useParams()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getNewsArticle(articleId)
      .then((result) => { if (active) setArticle(result.article) })
      .catch((loadError) => { if (active) setError(loadError.code === 'not-found' ? 'Bài viết không tồn tại hoặc bạn không có quyền đọc.' : loadError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [articleId])

  if (loading) return <section className="page-section"><p className="inline-status">Đang tải bài viết…</p></section>
  if (error) return <section className="page-section"><Link className="back-link" to="/tin-tuc">← Quay lại Tin tức</Link><p className="error-message" role="alert">{error}</p></section>
  if (!article) return null

  return <article className="page-section news-article-page">
    <Link className="back-link" to="/tin-tuc">← Quay lại Tin tức</Link>
    <p className="eyebrow">{article.accessMode === 'VIP' ? `VIP ${article.accessLevel}` : article.accessMode}</p>
    <h2>{article.title}</h2>
    <p className="news-article-meta">Cập nhật: {article.updatedAt ? new Date(article.updatedAt).toLocaleString('vi-VN') : '—'}</p>
    {article.excerpt && <p className="news-article-excerpt">{article.excerpt}</p>}
    <div className="news-article-content">{article.content}</div>
  </article>
}
