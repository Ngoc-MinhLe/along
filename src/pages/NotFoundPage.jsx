import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return <section className="page-section"><p className="eyebrow">404</p><h2>Không tìm thấy trang</h2><Link className="primary-button" to="/">Về trang chủ</Link></section>
}
