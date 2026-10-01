import { useEffect, useId, useState } from 'react'

export default function AsyncSearchSelect({
  label,
  value = '',
  selectedOption = null,
  onChange,
  loadOptions,
  getLabel = (option) => option.label || option.name || option.id,
  getMeta,
  placeholder = 'Tìm người dùng...',
  helperText = 'Nhập ít nhất 2 ký tự để tìm kiếm.',
  minQueryLength = 2,
  disabled = false,
  emptyMessage = 'Không tìm thấy kết quả phù hợp.',
}) {
  const componentId = useId().replace(/:/g, '')
  const resultsId = `async-search-${componentId}-${String(label || 'results').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'results'}`
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(selectedOption)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  useEffect(() => { setSelected(selectedOption) }, [selectedOption])

  useEffect(() => {
    const normalized = query.trim()
    if (normalized.length < minQueryLength) {
      setOptions([])
      setError('')
      setHighlightedIndex(-1)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const result = await loadOptions(normalized)
        if (!cancelled) {
          const nextOptions = Array.isArray(result) ? result : result?.items || []
          setOptions(nextOptions)
          setHighlightedIndex(nextOptions.length ? 0 : -1)
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Không thể tìm kiếm dữ liệu.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [loadOptions, minQueryLength, query])

  function choose(option) {
    setSelected(option)
    setQuery('')
    setOptions([])
    setHighlightedIndex(-1)
    onChange(option?.id || '', option || null)
  }

  function clear() {
    setSelected(null)
    setQuery('')
    setOptions([])
    setHighlightedIndex(-1)
    onChange('', null)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setQuery('')
      setOptions([])
      setHighlightedIndex(-1)
      return
    }
    if (!options.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((current) => (current + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((current) => (current - 1 + options.length) % options.length)
    } else if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault()
      choose(options[highlightedIndex])
    }
  }

  return <div className="async-search-select">
    <label>
      <span>{label}</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} disabled={disabled} aria-label={label} aria-expanded={options.length > 0} aria-controls={resultsId} />
    </label>
    <small className="admin-field-help">{helperText}</small>
    {loading && <small className="admin-muted" role="status">Đang tìm kiếm...</small>}
    {error && <small className="admin-error" role="alert">{error}</small>}
    {!loading && !error && query.trim().length >= minQueryLength && !options.length && <small className="admin-muted">{emptyMessage}</small>}
    {options.length > 0 && <div id={resultsId} className="async-search-results" role="listbox" aria-label={`${label} results`}>
      {options.map((option, index) => <button type="button" key={option.id} onClick={() => choose(option)} disabled={disabled} role="option" aria-selected={index === highlightedIndex} className={index === highlightedIndex ? 'is-highlighted' : ''}>
        <strong>{getLabel(option)}</strong>{getMeta?.(option) && <small>{getMeta(option)}</small>}
      </button>)}
    </div>}
    {selected && value && <div className="async-search-selected">
      <span><strong>{getLabel(selected)}</strong>{getMeta?.(selected) && <small>{getMeta(selected)}</small>}</span>
      <button type="button" onClick={clear} disabled={disabled}>Xóa lựa chọn</button>
    </div>}
  </div>
}
