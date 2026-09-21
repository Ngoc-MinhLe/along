export function generateRoleId(name) {
  const normalized = String(name ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (character) => character === 'Đ' ? 'D' : 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')

  const base = normalized || 'CUSTOM_ROLE'
  const validBase = /^[A-Z]/.test(base) ? base : `ROLE_${base}`
  return validBase.slice(0, 64).replace(/_+$/, '') || 'CUSTOM_ROLE'
}

export function roleIdCandidate(baseId, index) {
  const suffix = index === 1 ? '' : `_${index}`
  const prefix = baseId.slice(0, 64 - suffix.length).replace(/_+$/, '')
  return `${prefix || 'ROLE'}${suffix}`
}
