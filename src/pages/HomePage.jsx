import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <section className="page-section">
      <div className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">NỀN TẢNG ĐANG ĐƯỢC XÂY DỰNG</p>
          <h2>Tra cứu lịch thuận tiện, rõ ràng và có chiều sâu.</h2>
          <p>Phiên bản nền móng đã sẵn sàng cho Module 1. Dữ liệu lịch sẽ được kết nối sau khi xác nhận quy tắc ngày tháng và hoàn tất bước chuẩn hóa Excel.</p>
          <Link className="primary-button" to="/tra-cuu-lich">Mở tra cứu lịch <span>→</span></Link>
        </div>
        <div className="hero-orbit" aria-hidden="true"><span>2026</span><i /><i /><i /></div>
      </div>
      <div className="section-heading"><div><p className="eyebrow">TỔNG QUAN</p><h3>Các khu vực của ứng dụng</h3></div></div>
      <div className="overview-grid">
        <Link to="/tra-cuu-lich" className="overview-card featured"><span className="card-icon">▦</span><strong>Tra cứu lịch</strong><p>Chuẩn bị cho tìm kiếm theo khoảng ngày và bộ lọc Can Chi.</p><span className="card-link">Đang triển khai →</span></Link>
        <Link to="/tin-tuc" className="overview-card"><span className="card-icon muted">◫</span><strong>Tin tức</strong><p>Không gian nội dung với phân quyền VIP ở phase sau.</p><span className="card-link muted-text">Sắp ra mắt</span></Link>
        <Link to="/trac-nghiem" className="overview-card"><span className="card-icon muted">✓</span><strong>Trắc nghiệm</strong><p>Ngân hàng câu hỏi và chế độ luyện tập trong phase sau.</p><span className="card-link muted-text">Sắp ra mắt</span></Link>
      </div>
    </section>
  )
}
