import { useEffect, useMemo, useState } from 'react'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import SearchableSelect from '../components/SearchableSelect'
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

function policyLabel(policy) {
  if (!policy) return '—'
  if (policy.mode === 'VIP') return `VIP ${policy.minVipLevel}`
  return policy.mode
}

function articleLabel(article) {
  return article.title || article.id
}

function Field({ label, children }) {
  return <label className="news-form-field"><span>{label}</span>{children}</label>
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
  }, [canCreate, canUpdate, canDelete, canPublish, canReadManagementResources])

  async function runAction(action, successMessage) {
    setBusy(true); setMessage(''); setError('')
    try { await action(); setMessage(successMessage) } catch (actionError) { setError(actionError.message) } finally { setBusy(false) }
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

  return <section className="page-section news-management-page">
    <div className="page-title-row"><div><p className="eyebrow">NEWS MANAGEMENT</p><h2>Quản lý tin tức</h2><p className="lead">Các thao tác đều đi qua Callable Functions và được kiểm tra lại bằng RBAC phía server.</p></div></div>
    <ActionResult message={message} error={error} />
    {selectorError && <p className="admin-error" role="alert">Không tải được danh sách chọn tài nguyên: {selectorError}</p>}

    {canCreate && <section className="news-management-card"><h3>Tạo bài viết</h3><p className="news-help">Bài viết mới luôn được tạo ở trạng thái nháp.</p><div className="news-form-grid">
      <Field label="Tiêu đề"><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} /></Field>
      <Field label="Slug (tùy chọn)"><input value={article.slug} onChange={(event) => setArticle({ ...article, slug: event.target.value })} /></Field>
      <SearchableSelect label="Category" value={article.categoryId} options={categories} onChange={(value) => setArticle({ ...article, categoryId: value })} getLabel={(item) => item.name || item.id} getMeta={(item) => item.status} placeholder="Tìm category..." loading={selectorLoading} />
      <AccessFields value={article} onChange={setArticle} />
      <Field label="Mô tả"><textarea rows="2" value={article.excerpt} onChange={(event) => setArticle({ ...article, excerpt: event.target.value })} /></Field>
      <Field label="Nội dung"><textarea rows="8" value={article.content} onChange={(event) => setArticle({ ...article, content: event.target.value })} /></Field>
    </div><button className="admin-primary-button" type="button" disabled={busy} onClick={() => runAction(() => createNewsArticle(articlePayload()), 'Đã tạo bài viết nháp.')}>Tạo bài viết</button></section>}

    {canUpdate && <section className="news-management-card"><h3>Cập nhật bài viết</h3><p className="news-help">Chọn bài viết từ danh sách quản trị; không cần nhập Article ID.</p><div className="news-form-grid">
      <SearchableSelect label="Bài viết" value={article.articleId} options={articles} onChange={(value) => selectArticle(value, 'edit')} getLabel={articleLabel} getMeta={(item) => `${item.status} · ${policyLabel(item.accessPolicy)}`} placeholder="Tìm bài viết theo tiêu đề..." loading={selectorLoading} />
      <Field label="Tiêu đề"><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} /></Field>
      <Field label="Slug"><input value={article.slug} onChange={(event) => setArticle({ ...article, slug: event.target.value })} /></Field>
      <SearchableSelect label="Category" value={article.categoryId} options={categories} onChange={(value) => setArticle({ ...article, categoryId: value })} getLabel={(item) => item.name || item.id} getMeta={(item) => item.status} placeholder="Tìm category..." loading={selectorLoading} />
      <Field label="Mô tả"><textarea rows="2" value={article.excerpt} onChange={(event) => setArticle({ ...article, excerpt: event.target.value })} /></Field>
      <Field label="Nội dung"><textarea rows="6" value={article.content} onChange={(event) => setArticle({ ...article, content: event.target.value })} /></Field>
    </div><button className="admin-primary-button" type="button" disabled={busy || !article.articleId} onClick={() => runAction(() => updateNewsArticle(articlePayload()), 'Đã cập nhật bài viết.')}>Lưu cập nhật</button></section>}

    {canPublish && <section className="news-management-card"><h3>Xuất bản / gỡ xuất bản</h3><div className="news-inline-form"><SearchableSelect label="Bài viết" value={lifecycleId} options={articles} onChange={(value) => selectArticle(value, 'lifecycle')} getLabel={articleLabel} getMeta={(item) => `${item.status} · ${policyLabel(item.accessPolicy)}`} placeholder="Tìm bài viết..." loading={selectorLoading} /><button className="admin-primary-button" type="button" disabled={busy || !lifecycleId} onClick={() => runAction(() => publishNewsArticle(lifecycleId), 'Đã xuất bản bài viết.')}>Publish</button><button className="admin-secondary-button" type="button" disabled={busy || !lifecycleId} onClick={() => runAction(() => unpublishNewsArticle(lifecycleId), 'Đã chuyển bài viết về nháp.')}>Unpublish</button></div></section>}

    {canUpdate && <section className="news-management-card"><h3>Access policy</h3><div className="news-inline-form"><SearchableSelect label="Bài viết" value={accessId} options={articles} onChange={(value) => selectArticle(value, 'access')} getLabel={articleLabel} getMeta={(item) => `${item.status} · ${policyLabel(item.accessPolicy)}`} placeholder="Tìm bài viết..." loading={selectorLoading} /><AccessSelector mode={accessMode} minVipLevel={accessVipLevel} onModeChange={setAccessMode} onVipChange={setAccessVipLevel} /><button className="admin-primary-button" type="button" disabled={busy || !accessId} onClick={() => runAction(() => setNewsAccessPolicy(accessId, makePolicy(accessMode, accessVipLevel)), 'Đã cập nhật access policy.')}>Lưu policy</button></div></section>}

    {canUpdate && <section className="news-management-card"><h3>Special ACL</h3><p className="news-help">Scope ARTICLE/CATEGORY dùng selector tài nguyên. Principal hiện chỉ hỗ trợ USER/GROUP theo backend contract; group membership chưa thuộc phase này.</p><div className="news-form-grid">
      <Field label="Scope"><select value={acl.scope} onChange={(event) => setAcl({ ...acl, scope: event.target.value, resourceId: '' })}><option value="ARTICLE">ARTICLE</option><option value="CATEGORY">CATEGORY</option></select></Field>
      <SearchableSelect label={acl.scope === 'ARTICLE' ? 'Article' : 'Category'} value={acl.resourceId} options={aclResourceOptions} onChange={(value) => setAcl({ ...acl, resourceId: value })} getLabel={(item) => item.title || item.name || item.id} getMeta={(item) => item.title ? `${item.status} · ${policyLabel(item.accessPolicy)}` : item.status} placeholder="Tìm tài nguyên..." loading={selectorLoading} />
      <Field label="Principal type"><select value={acl.principalType} onChange={(event) => setAcl({ ...acl, principalType: event.target.value, principalId: '' })}><option value="USER">USER</option><option value="GROUP">GROUP</option></select></Field>
      <SearchableSelect label={acl.principalType === 'USER' ? 'User' : 'Group'} value={acl.principalId} options={principalOptions} onChange={(value) => setAcl({ ...acl, principalId: value })} getLabel={(item) => item.displayName || item.name || item.id} getMeta={(item) => item.email || item.status} placeholder="Tìm principal..." loading={selectorLoading} emptyMessage={acl.principalType === 'USER' ? 'Không tìm thấy user active.' : 'Không tìm thấy group active.'} />
    </div><div className="news-action-row"><button className="admin-primary-button" type="button" disabled={busy || !acl.resourceId || !acl.principalId} onClick={() => runAction(() => setNewsAclEntry(acl), 'Đã thêm ACL entry.')}>Thêm ACL</button><button className="admin-secondary-button" type="button" disabled={busy || !acl.resourceId || !acl.principalId} onClick={() => runAction(() => removeNewsAclEntry(acl), 'Đã xóa ACL entry.')}>Xóa ACL</button></div></section>}

    {(canCreate || canUpdate || canDelete) && <section className="news-management-card"><h3>Quản lý category</h3><p className="news-help">Category ID chỉ được chọn từ danh sách category backend cung cấp.</p><div className="news-form-grid">
      <SearchableSelect label="Category cần sửa/xóa" value={category.categoryId} options={categories} onChange={(value) => { const selected = categories.find((item) => item.id === value); setCategory({ ...category, categoryId: value, name: selected?.name || '', description: selected?.description || '', status: selected?.status || 'active' }) }} getLabel={(item) => item.name || item.id} getMeta={(item) => item.status} placeholder="Tìm category..." loading={selectorLoading} />
      <Field label="Tên category"><input value={category.name} onChange={(event) => setCategory({ ...category, name: event.target.value })} /></Field>
      <Field label="Slug"><input value={category.slug} onChange={(event) => setCategory({ ...category, slug: event.target.value })} /></Field>
      <Field label="Mô tả"><textarea rows="2" value={category.description} onChange={(event) => setCategory({ ...category, description: event.target.value })} /></Field>
      <AccessFields value={category} onChange={setCategory} allowInherit={false} />
      <Field label="Status"><select value={category.status} onChange={(event) => setCategory({ ...category, status: event.target.value })}><option value="active">active</option><option value="disabled">disabled</option></select></Field>
    </div><div className="news-action-row">{canCreate && <button className="admin-primary-button" type="button" disabled={busy} onClick={() => runAction(() => createNewsCategory({ ...category, defaultAccessPolicy: categoryPolicy() }), 'Đã tạo category.')}>Tạo category</button>}{canUpdate && <button className="admin-secondary-button" type="button" disabled={busy || !category.categoryId} onClick={() => runAction(() => updateNewsCategory({ ...category, defaultAccessPolicy: categoryPolicy() }), 'Đã cập nhật category.')}>Cập nhật category</button>}{canDelete && <button className="admin-danger-button" type="button" disabled={busy || !category.categoryId} onClick={() => runAction(() => deleteNewsCategory(category.categoryId), 'Đã xóa category.')}>Xóa category</button>}</div></section>}
  </section>
}

function AccessFields({ value, onChange, allowInherit = true }) {
  return <><Field label="Access level"><select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value })}><option value="PUBLIC">PUBLIC</option><option value="VIP">VIP</option><option value="SPECIAL">SPECIAL</option>{allowInherit && <option value="INHERIT">INHERIT</option>}</select></Field>{value.mode === 'VIP' && <Field label="VIP level"><select value={value.minVipLevel} onChange={(event) => onChange({ ...value, minVipLevel: Number(event.target.value) })}><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option></select></Field>}</>
}

function AccessSelector({ mode, minVipLevel, onModeChange, onVipChange }) {
  return <div className="news-access-selector"><Field label="Access level"><select value={mode} onChange={(event) => onModeChange(event.target.value)}><option value="PUBLIC">PUBLIC</option><option value="VIP">VIP</option><option value="SPECIAL">SPECIAL</option><option value="INHERIT">INHERIT</option></select></Field>{mode === 'VIP' && <Field label="VIP level"><select value={minVipLevel} onChange={(event) => onVipChange(Number(event.target.value))}><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option></select></Field>}</div>
}
