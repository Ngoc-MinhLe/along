import { NavLink } from 'react-router-dom'

const navigation = [
  { label: 'Trang chủ', path: '/', icon: '⌂' },
  { label: 'Tra cứu lịch', path: '/tra-cuu-lich', icon: '▦' },
  { label: 'Tin tức', path: '/tin-tuc', icon: '◫' },
  { label: 'Trắc nghiệm', path: '/trac-nghiem', icon: '✓' },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">V</div>
        <div><strong>Vạn Niên</strong><span>Tra cứu & học tập</span></div>
      </div>
      <nav className="navigation" aria-label="Điều hướng chính">
        <p className="nav-label">ỨNG DỤNG</p>
        {navigation.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">{item.icon}</span>{item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer"><span>Firebase project</span><strong>along-6e1ce</strong></div>
    </aside>
  )
}
