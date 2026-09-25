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

function GeneratedSlug({ value, onCustomize, customized = false, source = 'tiêu đề bài viết' }) {
  return <div className="news-generated-field">
    <span className="news-generated-label">Đường dẫn trang</span>
    <code>{value || 'Sẽ tự động tạo sau khi nhập tiêu đề'}</code>
    <small>Tự động tạo từ {source}.</small>
    <button className="news-inline-link" type="button" onClick={onCustomize}>{customized ? 'Chỉnh sửa đường dẫn' : 'Tùy chỉnh đường dẫn'}</button>
  </div>
}

function AdvancedDisclosure({ title, description, children }) {
  return <details className="news-optional-details">
    <summary><span>{title}</span><small>{description}</small></summary>
    <div className="news-optional-content">{children}</div>
  </details>
}

function ContentEditor({ value, onChange, disabled = false }) {
  return <div className="news-content-editor">
    <div className="news-content-editor-heading"><div><strong>Nội dung bài viết <em>*</em></strong><small>Soạn thảo</small></div><span>Văn bản thuần</span></div>
    <textarea rows="11" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Nhập nội dung bài viết..." disabled={disabled} />
    <small className="news-editor-note">Định dạng hiện tại là văn bản thuần. Có thể mở rộng thành trình soạn thảo giàu định dạng ở phase backend phù hợp.</small>
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
  const [draftArticle, setDraftArticle] = useState(emptyArticle)
  const [draftSlugEdited, setDraftSlugEdited] = useState(false)
  const [showDraftSlugEditor, setShowDraftSlugEditor] = useState(false)
  const [editingArticle, setEditingArticle] = useState(emptyArticle)
  const [editingSlugEdited, setEditingSlugEdited] = useState(false)
  const [showEditingSlugEditor, setShowEditingSlugEditor] = useState(false)
  const [selectedArticleId, setSelectedArticleId] = useState('')
  const [previewArticle, setPreviewArticle] = useState(null)
  const [category, setCategory] = useState(emptyCategory)
  const [categorySlugEdited, setCategorySlugEdited] = useState(false)
  const [showCategorySlugEditor, setShowCategorySlugEditor] = useState(false)
  const [acl, setAcl] = useState(emptyAcl)
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

  function friendlyNewsError(actionError) {
    const code = actionError?.code || ''
    const rawMessage = actionError?.message || ''
    if (code === 'already-exists') return 'Nội dung này đã tồn tại. Vui lòng dùng thông tin khác.'
    if (code === 'permission-denied') return 'Bạn không có quyền thực hiện thao tác này.'
    if (code === 'invalid-argument' && /slug/i.test(rawMessage)) return 'Đường dẫn chưa hợp lệ. Hãy dùng chữ cái, chữ số và dấu gạch ngang.'
    if (code === 'invalid-argument') return 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường bắt buộc.'
    return 'Không thể thực hiện thao tác. Vui lòng thử lại.'
  }

  function updateDraftTitle(title) {
    setDraftArticle((current) => ({ ...current, title, slug: draftSlugEdited ? current.slug : makeSlug(title) }))
  }

  function updateDraftSlug(slug) {
    setDraftArticle((current) => ({ ...current, slug }))
    setDraftSlugEdited(true)
  }

  function updateEditingTitle(title) {
    setEditingArticle((current) => ({ ...current, title, slug: editingSlugEdited ? current.slug : makeSlug(title) }))
  }

  function updateEditingSlug(slug) {
    setEditingArticle((current) => ({ ...current, slug }))
    setEditingSlugEdited(true)
  }

  function articleCreatePayload(article) {
    return {
      title: article.title,
      slug: article.slug || undefined,
      excerpt: article.excerpt,
      content: article.content,
      contentFormat: article.contentFormat,
      categoryId: article.categoryId || null,
      accessPolicy: makePolicy(article.mode, article.minVipLevel),
    }
  }

  function articleUpdatePayload(article) {
    return {
      articleId: article.articleId,
      title: article.title,
      slug: article.slug || undefined,
      excerpt: article.excerpt,
      content: article.content,
      contentFormat: article.contentFormat,
      categoryId: article.categoryId || null,
    }
  }

  async function saveDraft() {
    await runAction(async () => {
      if (draftArticle.articleId) {
        await updateNewsArticle(articleUpdatePayload(draftArticle))
        await setNewsAccessPolicy(draftArticle.articleId, makePolicy(draftArticle.mode, draftArticle.minVipLevel))
      } else {
        const result = await createNewsArticle(articleCreatePayload(draftArticle))
        setDraftArticle((current) => ({ ...current, articleId: result.articleId || '' }))
      }
      setSelectorRefreshKey((value) => value + 1)
    }, draftArticle.articleId ? 'Đã cập nhật bài viết nháp.' : 'Đã lưu bài viết nháp.')
  }

  async function publishDraft() {
    await runAction(async () => {
      let articleId = draftArticle.articleId
      if (articleId) {
        await updateNewsArticle(articleUpdatePayload(draftArticle))
        await setNewsAccessPolicy(articleId, makePolicy(draftArticle.mode, draftArticle.minVipLevel))
      } else {
        const result = await createNewsArticle(articleCreatePayload(draftArticle))
        articleId = result.articleId
        setDraftArticle((current) => ({ ...current, articleId: articleId || '' }))
      }
      if (!articleId) throw new Error('Không nhận được mã bài viết sau khi lưu.')
      await publishNewsArticle(articleId)
      setSelectorRefreshKey((value) => value + 1)
    }, 'Đã đăng bài viết.')
  }

  async function selectArticle(articleId) {
    setSelectedArticleId(articleId)
    if (!articleId) {
      setEditingArticle(emptyArticle)
      setEditingSlugEdited(false)
      setShowEditingSlugEditor(false)
      return
    }
    try {
      const result = await getNewsManagementArticle(articleId)
      const selected = result.article
      const nextArticle = { ...emptyArticle, ...selected, categoryId: selected.categoryId || '', mode: selected.accessPolicy?.mode || 'PUBLIC', minVipLevel: selected.accessPolicy?.minVipLevel || 1 }
      setEditingArticle(nextArticle)
      setEditingSlugEdited(Boolean(selected.slug && selected.slug !== makeSlug(selected.title)))
      setShowEditingSlugEditor(false)
      setAccessId(articleId)
      if (selected.accessPolicy) {
        setAccessMode(selected.accessPolicy.mode)
        setAccessVipLevel(selected.accessPolicy.minVipLevel || 1)
      }
    } catch (loadError) {
      setError(friendlyNewsError(loadError))
    }
  }

  async function saveEditing() {
    await runAction(async () => {
      await updateNewsArticle(articleUpdatePayload(editingArticle))
      setSelectorRefreshKey((value) => value + 1)
    }, 'Đã cập nhật bài viết.')
  }

  async function publishEditing() {
    await runAction(async () => {
      if (canUpdate) await updateNewsArticle(articleUpdatePayload(editingArticle))
      await publishNewsArticle(editingArticle.articleId)
      setEditingArticle((current) => ({ ...current, status: 'published' }))
      setSelectorRefreshKey((value) => value + 1)
    }, 'Đã xuất bản bài viết.')
  }

  async function unpublishEditing() {
    await runAction(async () => {
      await unpublishNewsArticle(editingArticle.articleId)
      setEditingArticle((current) => ({ ...current, status: 'draft' }))
      setSelectorRefreshKey((value) => value + 1)
    }, 'Đã chuyển bài viết về Nháp.')
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
      setError('Không thể tạo chuyên mục: hãy nhập tên có ít nhất một chữ cái hoặc chữ số, hoặc nhập Đường dẫn hợp lệ.')
      return
    }
    await runAction(async () => {
      await createNewsCategory({ ...category, slug, defaultAccessPolicy: makePolicy(category.mode, category.minVipLevel) })
      setCategory(emptyCategory)
      setCategorySlugEdited(false)
      setShowCategorySlugEditor(false)
      setSelectorRefreshKey((value) => value + 1)
    }, 'Đã tạo chuyên mục và cập nhật danh sách.')
  }

  function selectAccessArticle(articleId) {
    setAccessId(articleId)
    const selected = articles.find((item) => item.id === articleId)
    if (selected?.accessPolicy) {
      setAccessMode(selected.accessPolicy.mode)
      setAccessVipLevel(selected.accessPolicy.minVipLevel || 1)
    }
  }

  function scrollToCategoryManagement() {
    document.getElementById('news-category-management')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <section className="page-section news-management-page">
    <div className="page-title-row news-page-heading">
      <div><p className="eyebrow">NEWS MANAGEMENT</p><h2>Quản lý bài viết</h2><p className="lead">Tạo, lưu nháp, xem trước và đăng bài. Chỉ mở phần chỉnh sửa khi bạn cần sửa một bài viết đã tồn tại.</p></div>
    </div>

    <section className="news-guide-card" aria-labelledby="news-guide-title">
      <div className="news-guide-heading"><span className="news-guide-icon">▣</span><div><h3 id="news-guide-title">Quy trình đăng bài</h3><p>Bạn chỉ cần hoàn thành những bước cần thiết</p></div></div>
      <div className="news-steps" aria-label="Quy trình đăng bài">
        <span><b>1</b>Tạo bài viết</span><span><b>2</b>Lưu nháp hoặc xem trước</span><span><b>3</b>Đăng bài</span><span><b>4</b>Chỉnh sửa sau này nếu cần</span>
      </div>
      <p className="news-guide-note">Slug, chính sách truy cập và ACL là các thiết lập nâng cao; không cần hiểu chúng để đăng một bài viết thông thường.</p>
    </section>

    <ActionResult message={message} error={error} />
    {selectorError && <p className="admin-error" role="alert">Không thể tải danh sách bài viết hoặc tài nguyên. Vui lòng thử lại: {selectorError}</p>}

    {canCreate && <section className="news-management-card news-basic-card">
      <SectionHeader icon="＋" title="Tạo bài viết mới" subtitle="Nhập nội dung cơ bản. Bài viết mới sẽ ở trạng thái Nháp cho đến khi bạn đăng bài." />
      <div className="news-form-grid">
        <Field label="Tiêu đề bài viết *" help="Nhập tiêu đề chính của bài viết."><input value={draftArticle.title} onChange={(event) => updateDraftTitle(event.target.value)} /></Field>
        <div><GeneratedSlug value={draftArticle.slug} customized={draftSlugEdited} onCustomize={() => setShowDraftSlugEditor(true)} />{showDraftSlugEditor && <Field label="Đường dẫn tùy chỉnh"><input value={draftArticle.slug} onChange={(event) => updateDraftSlug(event.target.value)} /></Field>}</div>
        <div className="news-category-picker"><SearchableSelect label="Chuyên mục (tùy chọn)" value={draftArticle.categoryId} options={categories} onChange={(value) => setDraftArticle({ ...draftArticle, categoryId: value })} getLabel={(item) => item.name || item.id} getMeta={(item) => statusLabel(item.status)} placeholder="Tìm chuyên mục..." noDataMessage="Chưa có chuyên mục." loading={selectorLoading} />{!selectorLoading && !categories.length && <button className="news-inline-link" type="button" onClick={scrollToCategoryManagement}>+ Tạo chuyên mục</button>}</div>
        <Field label="Mô tả ngắn (tùy chọn)" help="Một đoạn tóm tắt ngắn giúp người đọc hiểu bài viết nói về điều gì."><textarea rows="3" value={draftArticle.excerpt} onChange={(event) => setDraftArticle({ ...draftArticle, excerpt: event.target.value })} /></Field>
        <ContentEditor value={draftArticle.content} onChange={(content) => setDraftArticle({ ...draftArticle, content })} />
        <AdvancedDisclosure title="Tùy chọn nâng cao: Chính sách truy cập" description="Mặc định: Công khai."><p className="news-help">Mặc định: bài viết được phép truy cập công khai.</p><AccessFields value={draftArticle} onChange={setDraftArticle} /></AdvancedDisclosure>
      </div>
      <div className="news-workflow-actions"><button className="admin-secondary-button" type="button" disabled={busy} onClick={saveDraft}>Lưu nháp</button><button className="admin-secondary-button" type="button" disabled={busy} onClick={() => setPreviewArticle(draftArticle)}>Xem trước</button><button className="admin-primary-button" type="button" disabled={busy} onClick={publishDraft}>Đăng bài</button></div>
    </section>}

    {(canUpdate || canPublish) && <section className="news-management-card news-basic-card">
      <SectionHeader icon="≡" title="Danh sách bài viết" subtitle="Chọn một bài viết đã tồn tại để xem hoặc chỉnh sửa. Đây không phải bước bắt buộc khi tạo bài mới." />
      <SearchableSelect label="Chọn bài viết cần chỉnh sửa" value={selectedArticleId} options={articles} onChange={selectArticle} getLabel={articleLabel} getMeta={articleMeta} placeholder="Tìm bài viết theo tiêu đề..." noDataMessage="Chưa có bài viết nào." loading={selectorLoading} />
      {!selectorLoading && !articles.length && <EmptyState title="Chưa có bài viết nào." action={canCreate ? <button className="news-inline-link" type="button" onClick={() => document.querySelector('.news-basic-card')?.scrollIntoView({ behavior: 'smooth' })}>Tạo bài viết mới ở phần phía trên</button> : null}>Danh sách sẽ xuất hiện sau khi có bài viết được lưu.</EmptyState>}
      {!selectorLoading && articles.length > 0 && <div className="news-article-list">{articles.map((item) => <button className={`news-article-list-row${item.id === selectedArticleId ? ' selected' : ''}`} type="button" key={item.id} onClick={() => selectArticle(item.id)}><span><strong>{articleLabel(item)}</strong><small>{articleMeta(item)}</small></span><span>Chỉnh sửa →</span></button>)}</div>}
      {selectedArticleId && editingArticle.articleId && <div className="news-article-edit-panel">
        <div className="news-edit-panel-heading"><strong>Chỉnh sửa bài viết đã chọn</strong><span className={`news-status-badge ${editingArticle.status}`}>{editingArticle.status === 'published' ? 'Đã xuất bản' : 'Nháp — chưa hiển thị công khai'}</span></div>
        <div className="news-form-grid">
          <Field label="Tiêu đề bài viết *"><input value={editingArticle.title} onChange={(event) => updateEditingTitle(event.target.value)} disabled={!canUpdate} /></Field>
          <div><GeneratedSlug value={editingArticle.slug} customized={editingSlugEdited} onCustomize={() => canUpdate && setShowEditingSlugEditor(true)} />{showEditingSlugEditor && <Field label="Đường dẫn tùy chỉnh"><input value={editingArticle.slug} onChange={(event) => updateEditingSlug(event.target.value)} disabled={!canUpdate} /></Field>}</div>
          <SearchableSelect label="Chuyên mục (tùy chọn)" value={editingArticle.categoryId} options={categories} onChange={(value) => setEditingArticle({ ...editingArticle, categoryId: value })} getLabel={(item) => item.name || item.id} getMeta={(item) => statusLabel(item.status)} placeholder="Tìm chuyên mục..." noDataMessage="Chưa có chuyên mục." loading={selectorLoading} disabled={!canUpdate} />
          <Field label="Mô tả ngắn (tùy chọn)"><textarea rows="3" value={editingArticle.excerpt} onChange={(event) => setEditingArticle({ ...editingArticle, excerpt: event.target.value })} disabled={!canUpdate} /></Field>
          <ContentEditor value={editingArticle.content} onChange={(content) => setEditingArticle({ ...editingArticle, content })} disabled={!canUpdate} />
        </div>
        <div className="news-workflow-actions">{canUpdate && <button className="admin-primary-button" type="button" disabled={busy} onClick={saveEditing}>Lưu cập nhật</button>}{canPublish && editingArticle.status !== 'published' && <button className="admin-secondary-button" type="button" disabled={busy} onClick={publishEditing}>Đăng bài</button>}{canPublish && editingArticle.status === 'published' && <button className="admin-secondary-button" type="button" disabled={busy} onClick={unpublishEditing}>Gỡ xuất bản</button>}<button className="news-inline-link" type="button" onClick={() => selectArticle('')}>Đóng chỉnh sửa</button></div>
      </div>}
    </section>}

    {canUpdate && <details className="news-management-card news-advanced-card news-advanced-disclosure">
      <summary><SectionHeader icon="3" title="Chính sách truy cập" subtitle="Tùy chọn nâng cao — thiết lập mức độ truy cập cho một bài viết cụ thể." tone="advanced" /><span className="news-disclosure-action">Mở phần nâng cao</span></summary>
      <div className="news-disclosure-body"><p className="news-help">Dùng khi muốn thay đổi mức độ truy cập của một bài viết. <HelpHint text="Chính sách truy cập quyết định nhóm người có thể xem bài viết." /></p><div className="news-inline-form"><SearchableSelect label="Bài viết" value={accessId} options={articles} onChange={selectAccessArticle} getLabel={articleLabel} getMeta={articleMeta} placeholder="Tìm bài viết..." noDataMessage="Chưa có bài viết để thiết lập chính sách." loading={selectorLoading} /><AccessSelector mode={accessMode} minVipLevel={accessVipLevel} onModeChange={setAccessMode} onVipChange={setAccessVipLevel} /><button className="admin-primary-button" type="button" disabled={busy || !accessId} onClick={() => runAction(() => setNewsAccessPolicy(accessId, makePolicy(accessMode, accessVipLevel)), 'Đã cập nhật chính sách truy cập.')}>Lưu chính sách</button></div></div>
    </details>}

    {canUpdate && <details className="news-management-card news-advanced-card news-advanced-disclosure">
      <summary><SectionHeader icon="+" title="Phân quyền đặc biệt (ACL)" subtitle="Chức năng nâng cao — chỉ dùng khi cần giới hạn quyền truy cập riêng cho người dùng hoặc nhóm." tone="advanced" /><span className="news-disclosure-action">Mở phần nâng cao</span></summary>
      <div className="news-disclosure-body"><p className="news-help news-warning-help">Với bài viết thông thường, bạn không cần thiết lập ACL.</p><div className="news-form-grid">
        <Field label="Phạm vi" help="Chọn bài viết hoặc chuyên mục mà ACL áp dụng."><select value={acl.scope} onChange={(event) => setAcl({ ...acl, scope: event.target.value, resourceId: '' })}><option value="ARTICLE">Bài viết</option><option value="CATEGORY">Chuyên mục</option></select></Field>
        <SearchableSelect label={acl.scope === 'ARTICLE' ? 'Bài viết' : 'Chuyên mục'} value={acl.resourceId} options={acl.scope === 'ARTICLE' ? articles : categories} onChange={(value) => setAcl({ ...acl, resourceId: value })} getLabel={(item) => item.title || item.name || item.id} getMeta={(item) => item.title ? articleMeta(item) : statusLabel(item.status)} placeholder="Tìm tài nguyên..." noDataMessage={acl.scope === 'ARTICLE' ? 'Chưa có bài viết.' : 'Chưa có chuyên mục.'} loading={selectorLoading} />
        <Field label="Loại đối tượng" help="Đối tượng nhận quyền truy cập đặc biệt."><select value={acl.principalType} onChange={(event) => setAcl({ ...acl, principalType: event.target.value, principalId: '' })}><option value="USER">Người dùng</option><option value="GROUP">Nhóm</option></select></Field>
        <SearchableSelect label={acl.principalType === 'USER' ? 'Người dùng' : 'Nhóm'} value={acl.principalId} options={principalOptions} onChange={(value) => setAcl({ ...acl, principalId: value })} getLabel={(item) => item.displayName || item.name || item.id} getMeta={(item) => item.email || statusLabel(item.status)} placeholder="Tìm người dùng hoặc nhóm..." emptyMessage="Không tìm thấy đối tượng phù hợp." noDataMessage={acl.principalType === 'USER' ? 'Chưa có người dùng active.' : 'Chưa có nhóm active.'} loading={selectorLoading} />
      </div><div className="news-action-row"><button className="admin-primary-button" type="button" disabled={busy || !acl.resourceId || !acl.principalId} onClick={() => runAction(() => setNewsAclEntry(acl), 'Đã thêm phân quyền đặc biệt.')}>Thêm ACL</button><button className="admin-secondary-button" type="button" disabled={busy || !acl.resourceId || !acl.principalId} onClick={() => runAction(() => removeNewsAclEntry(acl), 'Đã xóa phân quyền đặc biệt.')}>Thu hồi ACL</button></div></div>
    </details>}

    {(canCreate || canUpdate || canDelete) && <section id="news-category-management" className="news-management-card news-advanced-card">
      <SectionHeader icon="▣" title="Quản lý chuyên mục" subtitle="Chuyên mục giúp phân loại các bài viết theo chủ đề." tone="advanced" />
      <div className="news-form-grid">
        <SearchableSelect label="Chuyên mục cần sửa/xóa" value={category.categoryId} options={categories} onChange={(value) => { const selected = categories.find((item) => item.id === value); setCategory({ ...category, categoryId: value, name: selected?.name || '', slug: selected?.slug || '', description: selected?.description || '', status: selected?.status || 'active' }); setCategorySlugEdited(false); setShowCategorySlugEditor(false) }} getLabel={(item) => item.name || item.id} getMeta={(item) => statusLabel(item.status)} placeholder="Tìm chuyên mục..." noDataMessage="Chưa có chuyên mục. Hãy tạo chuyên mục đầu tiên." loading={selectorLoading} />
        <Field label="Tên chuyên mục *"><input value={category.name} onChange={(event) => updateCategoryName(event.target.value)} /></Field>
        <div><GeneratedSlug value={category.slug} customized={categorySlugEdited} source="tên chuyên mục" onCustomize={() => setShowCategorySlugEditor(true)} />{showCategorySlugEditor && <Field label="Đường dẫn tùy chỉnh"><input value={category.slug} onChange={(event) => updateCategorySlug(event.target.value)} /></Field>}</div>
        <Field label="Mô tả (tùy chọn)"><textarea rows="2" value={category.description} onChange={(event) => setCategory({ ...category, description: event.target.value })} /></Field>
        <AdvancedDisclosure title="Tùy chọn nâng cao: Chính sách truy cập" description="Mặc định: Công khai."><p className="news-help">Mặc định: chuyên mục được phép truy cập công khai.</p><AccessFields value={category} onChange={setCategory} allowInherit={false} /></AdvancedDisclosure>
        <Field label="Trạng thái"><select value={category.status} onChange={(event) => setCategory({ ...category, status: event.target.value })}><option value="active">Đang hoạt động</option><option value="disabled">Đã tắt</option></select></Field>
      </div>
      {!selectorLoading && !categories.length && <EmptyState title="Chưa có chuyên mục." action={<button className="news-inline-link" type="button" onClick={scrollToCategoryManagement}>Hãy tạo chuyên mục đầu tiên</button>}>Chuyên mục giúp bạn sắp xếp bài viết theo chủ đề.</EmptyState>}
      <div className="news-action-row">{canCreate && <button className="admin-primary-button" type="button" disabled={busy} onClick={createCategory}>Tạo chuyên mục</button>}{canUpdate && <button className="admin-secondary-button" type="button" disabled={busy || !category.categoryId} onClick={() => runAction(() => updateNewsCategory({ ...category, defaultAccessPolicy: makePolicy(category.mode, category.minVipLevel) }), 'Đã cập nhật chuyên mục.')}>Cập nhật chuyên mục</button>}{canDelete && <button className="admin-danger-button" type="button" disabled={busy || !category.categoryId} onClick={() => runAction(() => deleteNewsCategory(category.categoryId), 'Đã xóa chuyên mục.')}>Xóa chuyên mục</button>}</div>
    </section>}

    {previewArticle && <div className="news-preview-backdrop" role="presentation" onClick={() => setPreviewArticle(null)}><article className="news-preview-panel" role="dialog" aria-modal="true" aria-labelledby="news-preview-title" onClick={(event) => event.stopPropagation()}><div className="news-preview-header"><span className="news-status-badge draft">Bản xem trước</span><button className="close-button" type="button" onClick={() => setPreviewArticle(null)} aria-label="Đóng xem trước">×</button></div><p className="eyebrow">{policyLabel(makePolicy(previewArticle.mode, previewArticle.minVipLevel))}</p><h3 id="news-preview-title">{previewArticle.title || 'Chưa có tiêu đề'}</h3>{previewArticle.excerpt && <p className="news-article-excerpt">{previewArticle.excerpt}</p>}<div className="news-preview-content">{previewArticle.content || 'Chưa có nội dung.'}</div></article></div>}
  </section>
}

function AccessFields({ value, onChange, allowInherit = true }) {
  return <>
    <Field label="Mức độ truy cập" help="Xác định đối tượng có thể xem bài viết hoặc chuyên mục."><select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value })}><option value="PUBLIC">Công khai</option><option value="VIP">VIP</option><option value="SPECIAL">Phân quyền đặc biệt</option>{allowInherit && <option value="INHERIT">Theo chuyên mục</option>}</select></Field>
    {value.mode === 'VIP' && <Field label="Cấp độ VIP"><select value={value.minVipLevel} onChange={(event) => onChange({ ...value, minVipLevel: Number(event.target.value) })}><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option></select></Field>}
  </>
}

function AccessSelector({ mode, minVipLevel, onModeChange, onVipChange }) {
  return <div className="news-access-selector"><Field label="Mức độ truy cập"><select value={mode} onChange={(event) => onModeChange(event.target.value)}><option value="PUBLIC">Công khai</option><option value="VIP">VIP</option><option value="SPECIAL">Phân quyền đặc biệt</option><option value="INHERIT">Theo chuyên mục</option></select></Field>{mode === 'VIP' && <Field label="Cấp độ VIP"><select value={minVipLevel} onChange={(event) => onVipChange(Number(event.target.value))}><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option></select></Field>}</div>
}
