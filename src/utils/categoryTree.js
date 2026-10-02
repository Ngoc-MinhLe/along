function normalizeParentId(value) {
  return typeof value === 'string' && value.trim() ? value : null
}

export function buildCategoryMap(categories = []) {
  return new Map((Array.isArray(categories) ? categories : []).filter((category) => category && category.id).map((category) => [category.id, category]))
}

export function getCategoryPath(categoryId, categories = []) {
  const categoryMap = categories instanceof Map ? categories : buildCategoryMap(categories)
  const path = []
  const visited = new Set()
  let currentId = categoryId

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const category = categoryMap.get(currentId)
    if (!category) break
    path.unshift(category.name || category.id)
    currentId = normalizeParentId(category.parentId)
  }

  return path
}

export function buildCategoryBreadcrumb(categoryId, categories = []) {
  return getCategoryPath(categoryId, categories).join(' › ')
}
