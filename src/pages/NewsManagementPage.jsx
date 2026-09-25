import { useEffect, useMemo, useState } from 'react'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import SearchableSelect from '../components/SearchableSelect'
import { makeSlug } from '../utils/slug'
import {
  createNewsArticle, updateNewsArticle, publishNewsArticle, unpublishNewsArticle,
  setNewsAccessPolicy, createNewsCategory, updateNewsCategory, deleteNewsCategory,
  setNewsAclEntry, removeNewsAclEntry, listNewsManagement, getNewsManagementArticle,
  listNewsCategories, listNewsUsers, listNewsGroups,
} from '../services/news'

const emptyArticle = { articleId: '', title: '', slug: '', excerpt: '', content: '', contentFormat: 'PLAIN_TEXT', categoryId: '', mode: 'PUBLIC', minVipLevel: 1 }
const emptyCategory = { categoryId: '', name: '', slug: '', description: '', mode: 'PUBLIC', minVipLevel: 1, status: 'active' }
const emptyAcl = { scope: 'ARTICLE', resourceId: '', principalType: 'USER', principalId: '' }

function makePolicy(mode, minVipLevel) {
  if (mode === 'VIP') return { mode, minVipLevel: Number(minVipLevel) }
  if (mode === 'INHERIT') return { mode, inheritCategory: true }
  return { mode }
}

function statusLabel(status) {
  return { active: 'Đang hoạt động', disabled: 'Đã tắt', draft: 'Nháp', published: 'Đã xuất bản' }[status] || status
}

function policyLabel(policy) {
  if (!policy) return 'Chưa thiết lập'
  if (policy.mode === 'VIP') return `VIP ${policy.minVipLevel}`
  return { PUBLIC: 'Công khai', SPECIAL: 'Phân quyền đặc biệt', INHERIT: 'Theo chuyên mục' }[policy.mode] || policy.mode
}

function articleLabel(article) {
  return article.title || article.id
}

function articleMeta(article) {
  return `${statusLabel(article.status)} · ${policyLabel(article.accessPolicy)}`
}

function Field({ label, help, children }) {
  return <label className="news-form-field">
    <span>{label}{help && <HelpHint text={help} />}</span>
    {children}
  </label>
}

function HelpHint({ text }) {
  return <button className="news-help-hint" type="button" title={text} aria-label={text}>ⓘ</button>
}

function SectionHeader({ icon, title, subtitle, tone = 'basic' }) {
  return <div className={`news-section-heading ${tone}`}>
    <div className="news-section-title">
      <span className="news-section-number">{icon}</span>
      <div><h3>{title}</h3><p>{subtitle}</p></div>
    </div>
  </div>
}

function EmptyState({ icon = 'ⓘ', title, children, action }) {
  return <div className="news-empty-state">
    <span className="news-empty-icon">{icon}</span>
    <div><strong>{title}</strong><p>{children}</p>{action}</div>
  </div>
}

function ActionResult({ message, error }) {
  return <>{message && <p className="admin-success" role="status">{message}</p>}{error && <p className="admin-error" role="alert">{error}</p>}</>
}

export default function NewsManagementPage() {
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.NEWS_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.NEWS_UPDATE)
  const canDelete = hasPermission(PERMISSIONS.NEWS_DELETE)
  const canPublish = hasPermission(PERMISSIONS.NEWS_PUBLISH)
  const [article, setArticle] = useState(emptyArticle)
  const [category, setCategory] = useState(emptyCategory)
  const [categorySlugEdited, setCategorySlugEdited] = useState(false)
  const [acl, setAcl] = useState(emptyAcl)
  const [lifecycleId, setLifecycleId] = useState('')
  const [accessId, setAccessId] = useState('')
  const [accessMode, setAccessMode] = useState('PUBLIC')
  const [accessVipLevel, setAccessVipLevel] = useState(1)
  const [articles, setArticles] = useState([])
  const [categories, setCategories] = useState([])
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [selectorLoading, setSelectorLoading] = useState(false)
  const [selectorError, setSelectorError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectorRefreshKey, setSelectorRefreshKey] = useState(0)

  const canReadManagementResources = canCreate || canUpdate || canDelete || canPublish
  const aclResourceOptions = useMemo(() => acl.scope === 'ARTICLE' ? articles : categories, [acl.scope, articles, categories])
  const principalOptions = acl.principalType === 'USER' ? users : groups

  useEffect(() => {
    if (!canReadManagementResources) return undefined
    let cancelled = false
    async function loadSelectors() {
      setSelectorLoading(true); setSelectorError('')
      try {
        const [categoryResult, articleResult, userResult, groupResult] = await Promise.all([
          listNewsCategories({ limit: 50, includeDisabled: canCreate || canUpdate || canDelete }),
          canUpdate || canPublish ? listNewsManagement({ limit: 50 }) : Promise.resolve({ items: [] }),
          canUpdate ? listNewsUsers({ limit: 50 }) : Promise.resolve({ items: [] }),
          canUpdate ? listNewsGroups({ limit: 50 }) : Promise.resolve({ items: [] }),
        ])
        if (cancelled) return
        setCategories(categoryResult.items || [])
        setArticles(articleResult.items || [])
        setUsers(userResult.items || [])
        setGroups(groupResult.items || [])
      } catch (loadError) {
        if (!cancelled) setSelectorError(loadError.message)
      } finally {
        if (!cancelled) setSelectorLoading(false)
      }
    }
    loadSelectors()
    return () => { cancelled = true }
  }, [canCreate, canUpdate, canDelete, canPublish, canReadManagementResources, selectorRefreshKey])

  async function runAction(action, successMessage) {
    setBusy(true); setMessage(''); setError('')
    try { await action(); setMessage(successMessage) } catch (actionError) { setError(friendlyNewsError(actionError)) } finally { setBusy(false) }
  }

  function updateCategoryName(name) {
    setCategory((current) => ({ ...current, name, slug: categorySlugEdited ? current.slug : makeSlug(name) }))
  }

  function updateCategorySlug(slug) {
    setCategory((current) => ({ ...current, slug }))
    setCategorySlugEdited(true)
  }

  async function createCategory() {
    const slug = categorySlugEdited ? category.slug.trim() : makeSlug(category.name)
    if (!slug) {
      setMessage('')
      setError('Không thể tạo chuyên mục: hãy nhập tên có ít nhất một chữ cái hoặc chữ số, hoặc nhập Đường dẫn (Slug) hợp lệ.')
      return
    }
    await runAction(async () => {
      await createNewsCategory({ ...category, slug, defaultAccessPolicy: categoryPolicy() })
      setCategory(emptyCategory)
      setCategorySlugEdited(false)
      setSelectorRefreshKey((value) => value + 1)
    }, 'Đã tạo chuyên mục và cập nhật danh sách.')
  }

  function friendlyNewsError(actionError) {
    const code = actionError?.code || ''
    const rawMessage = actionError?.message || ''
    if (code === 'already-exists') return 'Chuyên mục này đã tồn tại. Vui lòng dùng tên hoặc đường dẫn khác.'
    if (code === 'permission-denied') return 'Bạn không có quyền thực hiện thao tác này.'
    if (code === 'invalid-argument' && /slug/i.test(rawMessage)) return 'Đường dẫn (Slug) chưa hợp lệ. Hãy dùng chữ cái, chữ số và dấu gạch ngang.'
    if (code === 'invalid-argument') return 'Thông tin chuyên mục chưa hợp lệ. Vui lòng kiểm tra lại các trường bắt buộc.'
    return 'Không thể thực hiện thao tác. Vui lòng thử lại.'
  }

  async function selectArticle(articleId, target = 'edit') {
    if (!articleId) {
      if (target === 'edit') setArticle(emptyArticle)
      if (target === 'lifecycle') setLifecycleId('')
      if (target === 'access') setAccessId('')
      if (target === 'acl') setAcl((current) => ({ ...current, resourceId: '' }))
      return
    }
    if (target === 'lifecycle') setLifecycleId(articleId)
    if (target === 'access') {
      setAccessId(articleId)
      const selected = articles.find((item) => item.id === articleId)
      if (selected?.accessPolicy) {
        setAccessMode(selected.accessPolicy.mode)
        setAccessVipLevel(selected.accessPolicy.minVipLevel || 1)
      }
    }
    if (target === 'acl') setAcl((current) => ({ ...current, resourceId: articleId }))
    if (target === 'edit') {
      try {
        const result = await getNewsManagementArticle(articleId)
        const selected = result.article
        setArticle({ ...emptyArticle, ...selected, categoryId: selected.categoryId || '', mode: selected.accessPolicy?.mode || 'PUBLIC', minVipLevel: selected.accessPolicy?.minVipLevel || 1 })
      } catch (loadError) { setSelectorError(loadError.message) }
    }
  }

  function articlePayload() {
    return { articleId: article.articleId, title: article.title, slug: article.slug || undefined, excerpt: article.excerpt, content: article.content, contentFormat: article.contentFormat, categoryId: article.categoryId || null, accessPolicy: makePolicy(article.mode, article.minVipLevel) }
  }

  function categoryPolicy() {
    return makePolicy(category.mode, category.minVipLevel)
  }

  function scrollToCategoryManagement() {
    document.getElementById('news-category-management')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <section className="page-section news-management-page">
    <div className="page-title-row news-page-heading">
      <div><p className="eyebrow">NEWS MANAGEMENT</p><h2>Quản lý tin tức</h2><p className="lead">Tạo, chỉnh sửa và xuất bản bài viết theo từng bước. Mọi thao tác vẫn được kiểm tra quyền ở phía máy chủ.</p></div>
    </div>

    <section className="news-guide-card" aria-labelledby="news-guide-title">
      <div className="news-guide-heading"><span className="news-guide-icon">▣</span><div><h3 id="news-guide-title">Hướng dẫn quản lý tin tức</h3><p>Quy trình đăng một bài viết</p></div></div>
      <div className="news-steps" aria-label="Quy trình đăng bài">
        <span><b>1</b>Tạo chuyên mục nếu cần</span><span><b>2</b>Tạo bài viết nháp</span><span><b>3</b>Chỉnh sửa nội dung</span><span><b>4</b>Thiết lập quyền nếu cần</span><span><b>5</b>Xuất bản</span>
      </div>
      <p className="news-guide-note">Bạn không cần sử dụng Phân quyền đặc biệt (ACL) nếu chỉ muốn đăng một bài viết thông thường.</p>
    </section>

    <ActionResult message={message} error={error} />
    {selectorError && <p className="admin-error" role="alert">Không thể tải danh sách chọn tài nguyên. Vui lòng thử lại: {selectorError}</p>}

    {canCreate && <section className="news-management-card news-basic-card">
      <SectionHeader icon="1" title="Tạo bài viết mới" subtitle="Bài viết sẽ được lưu ở trạng thái Nháp và chưa hiển thị công khai." />
      <div className="news-draft-notice"><strong>ⓘ Bài viết mới được tạo ở trạng thái Nháp.</strong><span>Bạn có thể chỉnh sửa trước khi xuất bản.</span></div>
      <div className="news-form-grid">
        <Field label="Tiêu đề bài viết" help="Nhập tiêu đề chính của bài viết."><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} /></Field>
        <Field label="Đường dẫn (Slug) – tùy chọn" help="Ví dụ: thong-bao-tuyen-sinh-2027. Nếu để trống, hệ thống có thể tự tạo."><input value={article.slug} onChange={(event) => setArticle({ ...article, slug: event.target.value })} /></Field>
        <div className="news-category-picker"><SearchableSelect label="Chuyên mục" value={article.categoryId} options={categories} onChange={(value) => setArticle({ ...article, categoryId: value })} getLabel={(item) => item.name || item.id} getMeta={(item) => statusLabel(item.status)} placeholder="Tìm chuyên mục..." noDataMessage="Chưa có chuyên mục." loading={selectorLoading} />{!selectorLoading && !categories.length && <button className="news-inline-link" type="button" onClick={scrollToCategoryManagement}>+ Tạo chuyên mục</button>}</div>
        <AccessFields value={article} onChange={setArticle} />
        <Field label="Mô tả ngắn" help="Nhập phần tóm tắt ngắn giúp người đọc hiểu bài viết nói về điều gì."><textarea rows="2" value={article.excerpt} onChange={(event) => setArticle({ ...article, excerpt: event.target.value })} /></Field>
        <Field label="Nội dung bài viết" help="Nhập nội dung đầy đủ của bài viết."><textarea rows="8" value={article.content} onChange={(event) => setArticle({ ...article, content: event.target.value })} /></Field>
      </div>
      <button className="admin-primary-button" type="button" disabled={busy} onClick={() => runAction(() => createNewsArticle(articlePayload()), 'Đã tạo bài viết nháp.')}>Tạo bài viết</button>
    </section>}

    {canUpdate && <section className="news-management-card news-basic-card">
      <SectionHeader icon="2" title="Chỉnh sửa bài viết" subtitle="Chọn bài viết từ danh sách để xem và chỉnh sửa nội dung." />
      <div className="news-form-grid">
        <SearchableSelect label="Bài viết" value={article.articleId} options={articles} onChange={(value) => selectArticle(value, 'edit')} getLabel={articleLabel} getMeta={articleMeta} placeholder="Tìm bài viết theo tiêu đề..." noDataMessage="Chưa có bài viết nào. Hãy tạo bài viết mới ở phần phía trên." loading={selectorLoading} />
        <Field label="Tiêu đề bài viết"><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} /></Field>
        <Field label="Đường dẫn (Slug)"><input value={article.slug} onChange={(event) => setArticle({ ...article, slug: event.target.value })} /></Field>
        <SearchableSelect label="Chuyên mục" value={article.categoryId} options={categories} onChange={(value) => setArticle({ ...article, categoryId: value })} getLabel={(item) => item.name || item.id} getMeta={(item) => statusLabel(item.status)} placeholder="Tìm chuyên mục..." noDataMessage="Chưa có chuyên mục." loading={selectorLoading} />
        <Field label="Mô tả ngắn"><textarea rows="2" value={article.excerpt} onChange={(event) => setArticle({ ...article, excerpt: event.target.value })} /></Field>
        <Field label="Nội dung bài viết"><textarea rows="6" value={article.content} onChange={(event) => setArticle({ ...article, content: event.target.value })} /></Field>
      </div>
      {!selectorLoading && !articles.length && <EmptyState title="Chưa có bài viết nào." action={<button className="news-inline-link" type="button" onClick={() => document.querySelector('.news-basic-card')?.scrollIntoView({ behavior: 'smooth' })}>Tạo bài viết mới ở phần phía trên</button>}>Hãy tạo bài viết mới trước, sau đó quay lại đây để chỉnh sửa.</EmptyState>}
      <button className="admin-primary-button" type="button" disabled={busy || !article.articleId} onClick={() => runAction(() => updateNewsArticle(articlePayload()), 'Đã cập nhật bài viết.')}>Lưu cập nhật</button>
    </section>}

    {canUpdate && <section className="news-management-card news-advanced-card">
      <SectionHeader icon="3" title="Chính sách truy cập" subtitle="Thiết lập mức độ truy cập cho một bài viết cụ thể." tone="advanced" />
      <p className="news-help">Sử dụng chức năng này khi muốn thay đổi mức độ truy cập của một bài viết. <HelpHint text="Chính sách truy cập quyết định nhóm người có thể xem bài viết." /></p>
      <div className="news-inline-form"><SearchableSelect label="Bài viết" value={accessId} options={articles} onChange={(value) => selectArticle(value, 'access')} getLabel={articleLabel} getMeta={articleMeta} placeholder="Tìm bài viết..." noDataMessage="Chưa có bài viết để thiết lập chính sách." loading={selectorLoading} /><AccessSelector mode={accessMode} minVipLevel={accessVipLevel} onModeChange={setAccessMode} onVipChange={setAccessVipLevel} /><button className="admin-primary-button" type="button" disabled={busy || !accessId} onClick={() => runAction(() => setNewsAccessPolicy(accessId, makePolicy(accessMode, accessVipLevel)), 'Đã cập nhật chính sách truy cập.')}>Lưu chính sách</button></div>
    </section>}

    {canPublish && <section className="news-management-card news-basic-card">
      <SectionHeader icon="4" title="Xuất bản / Gỡ xuất bản" subtitle="Sau khi hoàn thiện nội dung, bạn có thể xuất bản bài viết để người đọc truy cập." />
      <p className="news-help">Xuất bản đưa bài viết vào trạng thái công khai theo chính sách truy cập hiện tại. Gỡ xuất bản đưa bài viết về Nháp.</p>
      <div className="news-inline-form"><SearchableSelect label="Bài viết" value={lifecycleId} options={articles} onChange={(value) => selectArticle(value, 'lifecycle')} getLabel={articleLabel} getMeta={articleMeta} placeholder="Tìm bài viết..." noDataMessage="Chưa có bài viết để xuất bản." loading={selectorLoading} /><button className="admin-primary-button" type="button" disabled={busy || !lifecycleId} onClick={() => runAction(() => publishNewsArticle(lifecycleId), 'Đã xuất bản bài viết.')}>Xuất bản</button><button className="admin-secondary-button" type="button" disabled={busy || !lifecycleId} onClick={() => runAction(() => unpublishNewsArticle(lifecycleId), 'Đã chuyển bài viết về Nháp.')}>Gỡ xuất bản</button></div>
    </section>}

    {canUpdate && <section className="news-management-card news-advanced-card">
      <SectionHeader icon="+" title="Phân quyền đặc biệt (ACL)" subtitle="Cấp hoặc thu hồi quyền truy cập đặc biệt cho một người dùng hoặc nhóm đối với tài nguyên cụ thể." tone="advanced" />
      <p className="news-help news-warning-help">Đây là chức năng nâng cao. Với bài viết thông thường, bạn không cần thiết lập ACL.</p>
      <div className="news-form-grid">
        <Field label="Phạm vi" help="Chọn bài viết hoặc chuyên mục mà ACL áp dụng."><select value={acl.scope} onChange={(event) => setAcl({ ...acl, scope: event.target.value, resourceId: '' })}><option value="ARTICLE">Bài viết</option><option value="CATEGORY">Chuyên mục</option></select></Field>
        <SearchableSelect label={acl.scope === 'ARTICLE' ? 'Bài viết' : 'Chuyên mục'} value={acl.resourceId} options={aclResourceOptions} onChange={(value) => setAcl({ ...acl, resourceId: value })} getLabel={(item) => item.title || item.name || item.id} getMeta={(item) => item.title ? articleMeta(item) : statusLabel(item.status)} placeholder="Tìm tài nguyên..." noDataMessage={acl.scope === 'ARTICLE' ? 'Chưa có bài viết.' : 'Chưa có chuyên mục.'} loading={selectorLoading} />
        <Field label="Loại đối tượng" help="Đối tượng nhận quyền truy cập đặc biệt."><select value={acl.principalType} onChange={(event) => setAcl({ ...acl, principalType: event.target.value, principalId: '' })}><option value="USER">Người dùng</option><option value="GROUP">Nhóm</option></select></Field>
        <SearchableSelect label={acl.principalType === 'USER' ? 'Người dùng' : 'Nhóm'} value={acl.principalId} options={principalOptions} onChange={(value) => setAcl({ ...acl, principalId: value })} getLabel={(item) => item.displayName || item.name || item.id} getMeta={(item) => item.email || statusLabel(item.status)} placeholder="Tìm người dùng hoặc nhóm..." emptyMessage={acl.principalType === 'USER' ? 'Không tìm thấy người dùng phù hợp.' : 'Không tìm thấy nhóm phù hợp.'} noDataMessage={acl.principalType === 'USER' ? 'Chưa có người dùng active.' : 'Chưa có nhóm active.'} loading={selectorLoading} />
      </div>
      <div className="news-action-row"><button className="admin-primary-button" type="button" disabled={busy || !acl.resourceId || !acl.principalId} onClick={() => runAction(() => setNewsAclEntry(acl), 'Đã thêm phân quyền đặc biệt.')}>Thêm ACL</button><button className="admin-secondary-button" type="button" disabled={busy || !acl.resourceId || !acl.principalId} onClick={() => runAction(() => removeNewsAclEntry(acl), 'Đã xóa phân quyền đặc biệt.')}>Thu hồi ACL</button></div>
    </section>}

    {(canCreate || canUpdate || canDelete) && <section id="news-category-management" className="news-management-card news-advanced-card">
      <SectionHeader icon="▣" title="Quản lý chuyên mục" subtitle="Chuyên mục giúp phân loại các bài viết theo chủ đề." tone="advanced" />
      <div className="news-form-grid">
        <SearchableSelect label="Chuyên mục cần sửa/xóa" value={category.categoryId} options={categories} onChange={(value) => { const selected = categories.find((item) => item.id === value); setCategory({ ...category, categoryId: value, name: selected?.name || '', slug: selected?.slug || '', description: selected?.description || '', status: selected?.status || 'active' }); setCategorySlugEdited(false) }} getLabel={(item) => item.name || item.id} getMeta={(item) => statusLabel(item.status)} placeholder="Tìm chuyên mục..." noDataMessage="Chưa có chuyên mục. Hãy tạo chuyên mục đầu tiên." loading={selectorLoading} />
        <Field label="Tên chuyên mục"><input value={category.name} onChange={(event) => updateCategoryName(event.target.value)} /></Field>
        <Field label="Đường dẫn (Slug) – tự tạo" help="Đường dẫn được tự tạo từ tên chuyên mục. Bạn có thể chỉnh nếu cần."><input value={category.slug} onChange={(event) => updateCategorySlug(event.target.value)} /></Field>
        <Field label="Mô tả"><textarea rows="2" value={category.description} onChange={(event) => setCategory({ ...category, description: event.target.value })} /></Field>
        <AccessFields value={category} onChange={setCategory} allowInherit={false} />
        <Field label="Trạng thái"><select value={category.status} onChange={(event) => setCategory({ ...category, status: event.target.value })}><option value="active">Đang hoạt động</option><option value="disabled">Đã tắt</option></select></Field>
      </div>
      {!selectorLoading && !categories.length && <EmptyState title="Chưa có chuyên mục." action={<button className="news-inline-link" type="button" onClick={scrollToCategoryManagement}>Hãy tạo chuyên mục đầu tiên</button>}>Chuyên mục giúp bạn sắp xếp bài viết theo chủ đề.</EmptyState>}
      <div className="news-action-row">{canCreate && <button className="admin-primary-button" type="button" disabled={busy} onClick={createCategory}>Tạo chuyên mục</button>}{canUpdate && <button className="admin-secondary-button" type="button" disabled={busy || !category.categoryId} onClick={() => runAction(() => updateNewsCategory({ ...category, defaultAccessPolicy: categoryPolicy() }), 'Đã cập nhật chuyên mục.')}>Cập nhật chuyên mục</button>}{canDelete && <button className="admin-danger-button" type="button" disabled={busy || !category.categoryId} onClick={() => runAction(() => deleteNewsCategory(category.categoryId), 'Đã xóa chuyên mục.')}>Xóa chuyên mục</button>}</div>
    </section>}
  </section>
}

function AccessFields({ value, onChange, allowInherit = true }) {
  return <>
    <Field label="Mức độ truy cập" help="Xác định đối tượng có thể xem bài viết hoặc chuyên mục."><select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value })}><option value="PUBLIC">Công khai</option><option value="VIP">VIP</option><option value="SPECIAL">Phân quyền đặc biệt</option>{allowInherit && <option value="INHERIT">Theo chuyên mục</option>}</select></Field>
    {value.mode === 'VIP' && <Field label="Cấp độ VIP"><select value={value.minVipLevel} onChange={(event) => onChange({ ...value, minVipLevel: Number(event.target.value) })}><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option></select></Field>}
  </>
}

function AccessSelector({ mode, minVipLevel, onModeChange, onVipChange }) {
  return <div className="news-access-selector">
    <Field label="Mức độ truy cập" help="Chính sách quyết định ai có thể xem bài viết."><select value={mode} onChange={(event) => onModeChange(event.target.value)}><option value="PUBLIC">Công khai</option><option value="VIP">VIP</option><option value="SPECIAL">Phân quyền đặc biệt</option><option value="INHERIT">Theo chuyên mục</option></select></Field>
    {mode === 'VIP' && <Field label="Cấp độ VIP"><select value={minVipLevel} onChange={(event) => onVipChange(Number(event.target.value))}><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option></select></Field>}
  </div>
}
