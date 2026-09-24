import { useState } from 'react'
import { usePermissions } from '../auth/PermissionContext'
import { PERMISSIONS } from '../services/rbac/permissions'
import {
  createNewsArticle, updateNewsArticle, publishNewsArticle, unpublishNewsArticle,
  setNewsAccessPolicy, createNewsCategory, updateNewsCategory, deleteNewsCategory,
  setNewsAclEntry, removeNewsAclEntry,
} from '../services/news'

const emptyArticle = { title: '', slug: '', excerpt: '', content: '', contentFormat: 'PLAIN_TEXT', categoryId: '', mode: 'PUBLIC', minVipLevel: 1 }
const emptyCategory = { categoryId: '', name: '', slug: '', description: '', mode: 'PUBLIC', minVipLevel: 1, status: 'active' }
const emptyAcl = { scope: 'ARTICLE', resourceId: '', principalType: 'USER', principalId: '' }

function makePolicy(mode, minVipLevel, inheritCategory = false) {
  if (mode === 'VIP') return { mode, minVipLevel: Number(minVipLevel) }
  if (mode === 'INHERIT') return { mode, inheritCategory: true }
  return { mode }
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
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function runAction(action, successMessage) {
    setBusy(true); setMessage(''); setError('')
    try { await action(); setMessage(successMessage) } catch (actionError) { setError(actionError.message) } finally { setBusy(false) }
  }

  function articlePayload() {
    return { title: article.title, slug: article.slug || undefined, excerpt: article.excerpt, content: article.content, contentFormat: article.contentFormat, categoryId: article.categoryId, accessPolicy: makePolicy(article.mode, article.minVipLevel) }
  }

  function categoryPolicy() {
    return makePolicy(category.mode, category.minVipLevel)
  }

  return <section className="page-section news-management-page">
    <div className="page-title-row"><div><p className="eyebrow">NEWS MANAGEMENT</p><h2>Quản lý tin tức</h2><p className="lead">Các thao tác đều đi qua Callable Functions và được kiểm tra lại bằng RBAC phía server.</p></div></div>
    <ActionResult message={message} error={error} />

    {canCreate && <section className="news-management-card"><h3>Tạo bài viết</h3><p className="news-help">Bài viết mới luôn được tạo ở trạng thái nháp.</p><div className="news-form-grid">
      <Field label="Tiêu đề"><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} /></Field>
      <Field label="Slug (tùy chọn)"><input value={article.slug} onChange={(event) => setArticle({ ...article, slug: event.target.value })} /></Field>
      <Field label="Category ID"><input value={article.categoryId} onChange={(event) => setArticle({ ...article, categoryId: event.target.value })} /></Field>
      <AccessFields value={article} onChange={setArticle} />
      <Field label="Mô tả"><textarea rows="2" value={article.excerpt} onChange={(event) => setArticle({ ...article, excerpt: event.target.value })} /></Field>
      <Field label="Nội dung"><textarea rows="8" value={article.content} onChange={(event) => setArticle({ ...article, content: event.target.value })} /></Field>
    </div><button className="admin-primary-button" type="button" disabled={busy} onClick={() => runAction(() => createNewsArticle(articlePayload()), 'Đã tạo bài viết nháp.')}>Tạo bài viết</button></section>}

    {canUpdate && <section className="news-management-card"><h3>Cập nhật bài viết</h3><p className="news-help">Nhập Article ID. Access policy được thay đổi ở khu vực riêng.</p><div className="news-form-grid"><Field label="Article ID"><input value={article.articleId || ''} onChange={(event) => setArticle({ ...article, articleId: event.target.value })} /></Field><Field label="Tiêu đề"><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} /></Field><Field label="Slug"><input value={article.slug} onChange={(event) => setArticle({ ...article, slug: event.target.value })} /></Field><Field label="Category ID"><input value={article.categoryId} onChange={(event) => setArticle({ ...article, categoryId: event.target.value })} /></Field><Field label="Mô tả"><textarea rows="2" value={article.excerpt} onChange={(event) => setArticle({ ...article, excerpt: event.target.value })} /></Field><Field label="Nội dung"><textarea rows="6" value={article.content} onChange={(event) => setArticle({ ...article, content: event.target.value })} /></Field></div><button className="admin-primary-button" type="button" disabled={busy || !article.articleId} onClick={() => runAction(() => updateNewsArticle(article), 'Đã cập nhật bài viết.')}>Lưu cập nhật</button></section>}

    {canPublish && <section className="news-management-card"><h3>Xuất bản / gỡ xuất bản</h3><div className="news-inline-form"><Field label="Article ID"><input value={lifecycleId} onChange={(event) => setLifecycleId(event.target.value)} /></Field><button className="admin-primary-button" type="button" disabled={busy || !lifecycleId} onClick={() => runAction(() => publishNewsArticle(lifecycleId), 'Đã xuất bản bài viết.')}>Publish</button><button className="admin-secondary-button" type="button" disabled={busy || !lifecycleId} onClick={() => runAction(() => unpublishNewsArticle(lifecycleId), 'Đã chuyển bài viết về nháp.')}>Unpublish</button></div></section>}

    {canUpdate && <section className="news-management-card"><h3>Access policy</h3><div className="news-inline-form"><Field label="Article ID"><input value={accessId} onChange={(event) => setAccessId(event.target.value)} /></Field><AccessSelector mode={accessMode} minVipLevel={accessVipLevel} onModeChange={setAccessMode} onVipChange={setAccessVipLevel} /><button className="admin-primary-button" type="button" disabled={busy || !accessId} onClick={() => runAction(() => setNewsAccessPolicy(accessId, makePolicy(accessMode, accessVipLevel)), 'Đã cập nhật access policy.')}>Lưu policy</button></div></section>}

    {canUpdate && <section className="news-management-card"><h3>Special ACL</h3><p className="news-help">Chỉ quản lý ACL; việc tạo group và membership chưa thuộc phase này.</p><div className="news-form-grid"><Field label="Scope"><select value={acl.scope} onChange={(event) => setAcl({ ...acl, scope: event.target.value })}><option value="ARTICLE">ARTICLE</option><option value="CATEGORY">CATEGORY</option></select></Field><Field label="Resource ID"><input value={acl.resourceId} onChange={(event) => setAcl({ ...acl, resourceId: event.target.value })} /></Field><Field label="Principal type"><select value={acl.principalType} onChange={(event) => setAcl({ ...acl, principalType: event.target.value })}><option value="USER">USER</option><option value="GROUP">GROUP</option></select></Field><Field label="Principal ID"><input value={acl.principalId} onChange={(event) => setAcl({ ...acl, principalId: event.target.value })} /></Field></div><div className="news-action-row"><button className="admin-primary-button" type="button" disabled={busy} onClick={() => runAction(() => setNewsAclEntry(acl), 'Đã thêm ACL entry.')}>Thêm ACL</button><button className="admin-secondary-button" type="button" disabled={busy} onClick={() => runAction(() => removeNewsAclEntry(acl), 'Đã xóa ACL entry.')}>Xóa ACL</button></div></section>}

    {(canCreate || canUpdate || canDelete) && <section className="news-management-card"><h3>Quản lý category</h3><p className="news-help">Category ID cần lấy từ kết quả tạo category hoặc metadata backend; chưa có API list category trong contract hiện tại.</p><div className="news-form-grid"><Field label="Category ID"><input value={category.categoryId} onChange={(event) => setCategory({ ...category, categoryId: event.target.value })} /></Field><Field label="Tên category"><input value={category.name} onChange={(event) => setCategory({ ...category, name: event.target.value })} /></Field><Field label="Slug"><input value={category.slug} onChange={(event) => setCategory({ ...category, slug: event.target.value })} /></Field><Field label="Mô tả"><textarea rows="2" value={category.description} onChange={(event) => setCategory({ ...category, description: event.target.value })} /></Field><AccessFields value={category} onChange={setCategory} allowInherit={false} /><Field label="Status"><select value={category.status} onChange={(event) => setCategory({ ...category, status: event.target.value })}><option value="active">active</option><option value="disabled">disabled</option></select></Field></div><div className="news-action-row">{canCreate && <button className="admin-primary-button" type="button" disabled={busy} onClick={() => runAction(() => createNewsCategory({ ...category, defaultAccessPolicy: categoryPolicy() }), 'Đã tạo category.')}>Tạo category</button>}{canUpdate && <button className="admin-secondary-button" type="button" disabled={busy || !category.categoryId} onClick={() => runAction(() => updateNewsCategory({ ...category, defaultAccessPolicy: categoryPolicy() }), 'Đã cập nhật category.')}>Cập nhật category</button>}{canDelete && <button className="admin-danger-button" type="button" disabled={busy || !category.categoryId} onClick={() => runAction(() => deleteNewsCategory(category.categoryId), 'Đã xóa category.')}>Xóa category</button>}</div></section>}
  </section>
}

function AccessFields({ value, onChange, allowInherit = true }) {
  return <><Field label="Access level"><select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value })}><option value="PUBLIC">PUBLIC</option><option value="VIP">VIP</option><option value="SPECIAL">SPECIAL</option>{allowInherit && <option value="INHERIT">INHERIT</option>}</select></Field>{value.mode === 'VIP' && <Field label="VIP level"><select value={value.minVipLevel} onChange={(event) => onChange({ ...value, minVipLevel: Number(event.target.value) })}><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option></select></Field>}</>
}

function AccessSelector({ mode, minVipLevel, onModeChange, onVipChange }) {
  return <div className="news-access-selector"><Field label="Access level"><select value={mode} onChange={(event) => onModeChange(event.target.value)}><option value="PUBLIC">PUBLIC</option><option value="VIP">VIP</option><option value="SPECIAL">SPECIAL</option><option value="INHERIT">INHERIT</option></select></Field>{mode === 'VIP' && <Field label="VIP level"><select value={minVipLevel} onChange={(event) => onVipChange(Number(event.target.value))}><option value="1">VIP 1</option><option value="2">VIP 2</option><option value="3">VIP 3</option></select></Field>}</div>
}
