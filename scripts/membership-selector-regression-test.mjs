import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

// Execute real component event handlers with a deterministic hook/timer harness.
// This is a component logic regression test, NOT a DOM/browser E2E test.
function harness(file, modules = {}) {
  const slots = []
  const timers = new Map()
  let index = 0, dirty = true, effects = [], tree, props = {}, timerId = 0
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useId: () => 'selector-test',
    useState(initial) {
      const key = index++
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial
      return [slots[key], (value) => {
        const next = typeof value === 'function' ? value(slots[key]) : value
        if (!Object.is(slots[key], next)) { slots[key] = next; dirty = true }
      }]
    },
    useMemo(factory, deps) {
      const key = index++
      if (!same(slots[key]?.deps, deps)) slots[key] = { deps, value: factory() }
      return slots[key].value
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps) },
    useEffect(callback, deps) {
      const key = index++
      if (!same(slots[key]?.deps, deps)) {
        const previous = slots[key]
        slots[key] = { deps }
        effects.push(() => { previous?.cleanup?.(); slots[key].cleanup = callback() })
      }
    },
  }
  const element = (type, props) => ({ type, props })
  const module = { exports: {} }
  const context = {
    module, exports: module.exports,
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element }
      assert.ok(name in modules, `Unexpected dependency: ${name}`)
      return modules[name]
    },
    setTimeout(callback) { const key = ++timerId; timers.set(key, callback); return key },
    clearTimeout(key) { timers.delete(key) },
  }
  vm.runInNewContext(transformSync(readFileSync(file, 'utf8'), {
    loader: 'jsx', format: 'cjs', jsx: 'automatic',
  }).code, context, { filename: file })
  function render(nextProps = props) {
    props = nextProps; dirty = true
    for (let n = 0; dirty; n++) {
      assert.ok(n < 30, 'Unexpected render loop')
      dirty = false; index = 0; effects = []
      tree = module.exports.default(props)
      effects.forEach((effect) => effect())
    }
    return tree
  }
  function nodes(predicate, node = tree) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap((item) => nodes(predicate, item ?? null))
    return [...(predicate(node) ? [node] : []), ...nodes(predicate, node.props?.children ?? null)]
  }
  return {
    render, nodes, exports: module.exports,
    async settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render() } },
    async runTimers() {
      const pending = [...timers.values()]; timers.clear()
      await Promise.all(pending.map((callback) => callback()))
      render()
    },
  }
}

// Verify the actual client serialization, including optional query/cursor.
const calls = []
const client = harness('src/services/membership.js', {
  'firebase/functions': { httpsCallable: (_, name) => async (payload) => {
    calls.push({ name, payload }); return { data: { items: [] } }
  } },
  '../firebase/client': { functions: {} },
}).exports
for (const query of ['vip', 'VIP', 'gold', 'platinum']) {
  await client.listMembershipTiers({ query, limit: 20 })
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify({ name: 'listMembershipTiers', payload: { includeInactive: false, limit: 20, query } }))
}
await client.listMembershipTiers()
assert.equal('query' in calls.at(-1).payload, false)

const free = { id: 'free', name: 'Free', level: 1 }
const vip = { id: 'vip', name: 'VIP', level: 10 }
const gold = { id: 'gold', name: 'GOLD', level: 20 }
const page = harness('src/pages/AdminMembershipsPage.jsx', {
  '../components/AsyncSearchSelect': { default: 'AsyncSelector' },
  '../components/CursorPagination': { default: 'Pagination' },
  '../auth/PermissionContext': { usePermissions: () => ({ hasPermission: () => true }) },
  '../services/rbac/permissions': { PERMISSIONS: {} },
  '../services/rbac/firestore': { listUsersPage: async () => ({ items: [] }) },
  '../services/membership': {
    listMemberships: async () => ({ items: [] }),
    listMembershipTiers: async () => ({ items: [free] }),
    getUserMemberships: async () => ({ items: [] }),
    createManualMembership: () => { throw Error('Unexpected mutation') },
    revokeMembership: () => { throw Error('Unexpected mutation') },
  },
})
page.render(); await page.settle()
const tierProps = () => page.nodes((n) => n.props?.label === 'Membership Tier')[0].props
assert.equal(tierProps().value, '', 'First tier must NOT be auto-selected')
assert.equal(page.nodes((n) => n.props?.className === 'membership-tier-summary').length, 0)
tierProps().onChange(vip.id, vip); page.render()
assert.equal(tierProps().value, vip.id)
assert.equal(tierProps().selectedOption.name, 'VIP')
assert.equal(page.nodes((n) => n.props?.className === 'membership-tier-summary').length, 1)

let rejectSearch = false, resolveSlow
const selector = harness('src/components/AsyncSearchSelect.jsx')
const props = { ...tierProps(), loadOptions: async (query) => {
  if (query === 'slow') return new Promise((resolve) => { resolveSlow = resolve })
  if (rejectSearch) throw Error('Search failed')
  return { items: query === 'gold' ? [gold] : [vip] }
}, onChange(id, option) {
  tierProps().onChange(id, option); page.render()
  props.value = tierProps().value; props.selectedOption = tierProps().selectedOption
} }
selector.render(props)
const input = () => selector.nodes((n) => n.type === 'input')[0]
function type(text) { input().props.onChange({ target: { value: text } }); selector.render(props) }
type('gold')
assert.equal(tierProps().value, '', 'Typing a replacement clears the old tier, never reverts to Free')
assert.equal(tierProps().selectedOption, null)
await selector.runTimers()
selector.nodes((n) => n.props?.role === 'option')[0].props.onClick()
selector.render(props)
assert.equal(tierProps().value, 'gold')
assert.equal(tierProps().selectedOption.name, 'GOLD')
page.nodes((n) => n.type === 'select')[0].props.onChange({ target: { value: 'ACTIVE' } })
page.render()
await page.settle()
assert.equal(tierProps().value, 'gold', 'Refresh must not replace selected tier with Free')
type('vip'); await selector.runTimers()
rejectSearch = true
type('platinum')
assert.equal(selector.nodes((n) => n.props?.role === 'option').length, 0, 'Clear stale results immediately')
await selector.runTimers()
assert.equal(selector.nodes((n) => n.props?.role === 'alert').length, 1)
assert.equal(selector.nodes((n) => n.props?.role === 'option').length, 0)
assert.equal(tierProps().value, '')
rejectSearch = false
type('slow')
const pending = selector.runTimers()
await Promise.resolve()
type('vip'); await selector.runTimers()
resolveSlow({ items: [free] }); await pending
assert.equal(selector.nodes((n) => n.props?.role === 'option')[0].props.children[0].props.children, 'VIP', 'Late results cannot replace the latest query')
type('')
assert.equal(selector.nodes((n) => n.props?.role === 'status').length, 0, 'Clearing cancels loading')

let changed = false
const defaultSelector = harness('src/components/AsyncSearchSelect.jsx')
defaultSelector.render({ label: 'Other selector', value: vip.id, selectedOption: vip,
  onChange: () => { changed = true }, loadOptions: async () => ({ items: [gold] }) })
defaultSelector.nodes((n) => n.type === 'input')[0].props.onChange({ target: { value: 'gold' } })
defaultSelector.render()
assert.equal(changed, false, 'Opt-in tier behavior must not clear selections in other workflows')

console.log('Membership selector logic PASS: client payload, no default Free, explicit selection, error/stale response handling. Browser E2E not performed.')
