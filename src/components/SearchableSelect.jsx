import { useMemo, useState } from 'react'

/**
 * A small, dependency-free resource picker. The selected value remains the
 * authoritative document ID, while the user interacts with a label/search UI.
 */
export default function SearchableSelect({
  label,
  value = '',
  options = [],
  onChange,
  getLabel = (option) => option.label || option.name || option.id,
  getMeta,
  placeholder = 'Tìm và chọn…',
  emptyMessage = 'Không tìm thấy lựa chọn phù hợp.',
  disabled = false,
  loading = false,
  allowClear = true,
}) {
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.id === value) || null
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return options
    return options.filter((option) => `${getLabel(option)} ${getMeta?.(option) || ''}`.toLowerCase().includes(normalized))
  }, [getLabel, getMeta, options, query])

  return <div className="resource-selector">
    <label>
      <span>{label}</span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        disabled={disabled || loading}
        aria-label={label}
      />
    </label>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || loading}
      aria-label={`${label} selection`}
    >
      <option value="">{loading ? 'Đang tải…' : `-- ${label} --`}</option>
      {filtered.map((option) => <option key={option.id} value={option.id}>
        {getLabel(option)}{getMeta?.(option) ? ` · ${getMeta(option)}` : ''}
      </option>)}
    </select>
    {!loading && !filtered.length && <small className="resource-selector-empty">{emptyMessage}</small>}
    {selected && <div className="resource-selector-preview">
      <strong>{getLabel(selected)}</strong>
      {getMeta?.(selected) && <small>{getMeta(selected)}</small>}
      {allowClear && <button type="button" onClick={() => onChange('')} disabled={disabled}>Xóa lựa chọn</button>}
    </div>}
  </div>
}
