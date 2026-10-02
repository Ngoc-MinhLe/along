# PHASE 10.23 — PRODUCTION VERIFICATION REPORT

Date: 2026-10-02
Project: `along-6e1ce`

## Production verification

**PASS — manually verified by the user, with documented limitations.**

| Scenario | Result |
|---|---|
| Tier search `Go` → Gold | PASS |
| Tier search `vi` → VIP | PASS |
| Tier search `p` → Platinum | PASS |
| Tier name and Level rendering | PASS |
| Tier selector interaction | PASS |
| Accidental first-tier/Free selection during search | PASS |
| Previous HTTP 400 from `listMembershipTiers` | NOT REPRODUCED |
| Membership mutation | NOT PERFORMED |
| Production data change | NO |
| Deployment during Phase 10.23 | NO |
| Commit | NO |
| Push | NO |

The backend fix from Phase 10.22 was already deployed before this phase. No
additional Firebase/Vercel deployment was performed. No Membership was created,
and no Tier was created, updated, deactivated, or deleted during verification.

## Implementation/source alignment

The observed behavior is consistent with the Phase 10.22 implementation:

- the client sends bounded `query` requests through the existing callable;
- production `listMembershipTiers` no longer rejects that field;
- tier results are selected explicitly;
- the assignment selector does not silently retain the previous tier while a
  replacement query is being typed;
- no direct Firestore write, RBAC change, Rules change, or schema change is
  involved.

Phase 10.22 production evidence recorded the deployed function as ACTIVE in
`us-central1`, Node.js 22 / Gen 2, revision
`listmembershiptiers-00005-qik`, with the expected production CORS boundary
and unauthenticated `401 UNAUTHENTICATED` response. Phase 10.23 did not repeat
deployment or mutation.

## `onboarding.js:48` console error

Repository search found no `onboarding.js` source, import, script reference, or
application dependency. Existing audit reports also record that no matching
onboarding/instrumentation source exists in this checkout.

Therefore the reported `Uncaught (in promise) undefined onboarding.js:48` is
currently **not attributable to this application from repository evidence**.
It may be browser instrumentation, an extension, a deployed artifact outside
the current source, or another external script. It was not changed and is not
classified as a Membership Tier regression. Definitive attribution would need
the browser's script URL/source map and a clean browser profile comparison.

## Regression tests

| Command | Result |
|---|---|
| `npm run check:functions` | PASS |
| `npm run test:functions` | PASS |
| `npm run test:functions:membership:emulator` | PASS |
| `npm run test:functions:membership-tier:emulator` | PASS |
| `npm run test:functions:news:emulator` | PASS |
| `npm run test:functions:system-role:emulator` | PASS |
| `npm run test:functions:authorization-rebuild:emulator` | PASS |
| `npm run test:authorization` | PASS |
| `npm run test:rbac` | PASS |
| `npm run test:policy-conformance` | PASS |
| `npm run test:frontend-rbac` | PASS |
| `npm run test:frontend-membership` | PASS |
| `npm run test:frontend-news` | PASS |
| `npm run test:admin-scalability` | PASS |
| `npm run test:resource-selectors` | PASS |
| `npm run test:system-role-tool` | PASS |
| `npm run test:rules` | PASS — 84 assertions |
| `npm run build -- --emptyOutDir false` | PASS |
| `git diff --check` | PASS |

The first plain `npm run build` invocation was blocked by Windows `EPERM` while
Vite attempted to remove the existing generated file
`dist/assets/index-Dywy9qGU.css`. The artifact directory is ignored build output;
no source file was involved. Removing the artifact was also denied by the same
filesystem lock/permission condition. The equivalent Vite build with
`--emptyOutDir false` compiled and bundled the current source successfully;
the only build warning was the existing large JavaScript chunk warning.

All emulator writes were isolated to emulator projects. Production was not
used by the tests and no production mutation was issued.

## Git and scope

Branch: `main`

HEAD before/after verification: `7aa590a3e746b7989502b90bab128962ab5e2a4d`

The working tree remains intentionally dirty. It contains the preserved
Phase 10.20/10.21 changes and Phase 10.22 implementation/tests/report, plus
this Phase 10.23 report. No unrelated source was reset or discarded.

Current modified/untracked paths:

- `functions/src/membership-service.js`
- `functions/src/user-service.js` (preserved Phase 10.20)
- `functions/test/membership-tier-emulator.test.js`
- `functions/test/membership-tier.test.js`
- `functions/test/user-selector.test.js` (preserved Phase 10.20)
- `scripts/membership-frontend-test.mjs`
- `scripts/membership-selector-regression-test.mjs`
- `src/components/AsyncSearchSelect.jsx`
- `src/pages/AdminMembershipsPage.jsx`
- `docs/PHASE_10_20_USER_SEARCH_FIX_REPORT.md` (preserved)
- `docs/PHASE_10_21_PRE_DEPLOY_REPORT.md` (preserved)
- `docs/PHASE_10_21_DEPLOYMENT_REPORT.md` (preserved)
- `docs/PHASE_10_22_TIER_SELECTOR_FIX_REPORT.md` (preserved Phase 10.22)
- `docs/PHASE_10_23_PRODUCTION_VERIFICATION_REPORT.md`

No Rules, index, credential, `.env`, private key, or production-data file was
changed. `git diff --check` passed.

## Final status

```text
PHASE 10.23: PASS WITH LIMITATIONS
PRODUCTION VERIFICATION: PASS (manual user verification)
TIER SEARCH Go -> Gold: PASS
TIER SEARCH vi -> VIP: PASS
TIER SEARCH p -> Platinum: PASS
HTTP 400: NOT REPRODUCED
MEMBERSHIP MUTATION: NOT PERFORMED
PRODUCTION DATA CHANGE: NO
DEPLOY: NO
COMMIT: NO
PUSH: NO
WORKING TREE: DIRTY (preserved uncommitted work)
```

Limitations: the browser checks were manual, not automated E2E; the
`onboarding.js:48` error remains unclassified beyond repository evidence; and
the plain build command still needs a filesystem cleanup/lock fix before it can
be reported as a direct PASS.
