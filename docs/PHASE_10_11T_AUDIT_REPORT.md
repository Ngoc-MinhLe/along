# PHASE 10.11T — ADMIN UX AUDIT BEFORE IMPLEMENTATION

## Scope

This is the pre-implementation audit required by Phase 10.11T. It reviews the
current Admin UI without changing RBAC, permission catalogs, authorization
materialization, News evaluation, Membership schema, Functions, Rules, or
production data.

## Audit findings

| Screen | Field/area | Current wording or behavior | Issue | User needs to know | UX direction |
|---|---|---|---|---|---|
| `/admin` | Dashboard copy and role list | Uses RBAC foundation, System Roles, permission wording | Technical terms are not explained in business language | This page is an overview of available administration areas | Explain that visible areas depend on the current account's effective permissions |
| `/admin/users` | Search, filters, sorting | `System Role`, `Status`, `Custom Role`, `Sort`, raw status values | Developer terminology and English controls make filtering less clear | Search a user and narrow by role/status | Use Vietnamese business labels and short helper text |
| `/admin/users` | Profile details | Shows `UID`, `Status`, `Created At`, `Last Login`, `Display name`, `Photo URL` | Technical identifiers and URL field are exposed without context | UID is reference information; profile fields describe the account | Explain reference fields; use business labels for dates and profile data |
| `/admin/users` | System Role management | Shows role keys and `ROOT ONLY`/`READ ONLY` | Role keys are implementation identifiers | System Role controls the account's base administration scope | Show human-readable role names with concise explanation; keep keys secondary |
| `/admin/users` | Custom Role assignment | Shows role IDs, permission counts, delegation scope, `policy`, `SYSTEM`, `CUSTOM` | Permission/delegation concepts need explanation | A Custom Role is a bundle of allowed actions; assignment is policy-limited | Explain what will be granted and why an assignment may be blocked |
| `/admin/roles` | System Roles | Raw hierarchy keys and `READ ONLY` | System Role is technical terminology without an immediate business explanation | Fixed platform role; not editable as a Custom Role | Add Vietnamese heading/helper and preserve read-only behavior |
| `/admin/roles` | Custom Role | `Custom Role`, generated technical role ID, raw permission keys, `Created by`, `Updated` | Administrators may not know role IDs or permission codes | Name/description identify the business role; permissions describe allowed actions | Explain generated ID, role purpose, and permission groups; keep ID read-only |
| `/admin/roles` | Permission selection | `Permissions`, raw keys, `policy protected` | Permission catalog is implementation-oriented | Select the actions this Custom Role may perform | Use business names/descriptions and explain protected actions |
| `/admin/permissions` | Catalog | `Permission Catalog`, `CODE CATALOG`, raw permission keys only | No business descriptions are shown | Each item represents an action the system can allow | Show business name, description, and technical key as secondary reference |
| `/admin/memberships` | User | `User` and account identifiers | Field purpose is implicit | Select the account receiving Membership | Label as account/user receiving Membership and explain briefly |
| `/admin/memberships` | Tier | `VIP tier`, raw `level` in options | Hard-coded VIP wording conflicts with dynamic tiers | Select an active Membership tier | Use `Membership tier`; display dynamic name and level meaning |
| `/admin/memberships` | Dates | `Bắt đầu`, `Hết hạn` | Expiration semantics are not explained | Start controls when access begins; blank expiry means no end date | Add concise helper text for start and optional expiry |
| `/admin/memberships` | History/status/source | `ACTIVE`, `REVOKED`, `MANUAL`, `Assigned by` | Raw lifecycle/source values are technical | Understand current state and how it was granted | Use business labels; retain technical values only as secondary detail |
| `/admin/membership-tiers` | Tier ID | Required editable input on create | Technical document identifier is exposed and required from admin | Admin needs a meaningful tier name, not a Firestore ID | Generate a stable ID from the name on create; keep ID immutable/read-only on edit |
| `/admin/membership-tiers` | Tier name | `Tên tier` | “Tier” is not explained | Human-readable Membership level name, e.g. Gold or VIP 10 | Use `Tên Membership` with examples |
| `/admin/membership-tiers` | Level | `Level` | Meaning is not explained | Positive integer used by backend to compare Membership levels | Add short helper text; keep dynamic integer contract |
| `/admin/membership-tiers` | Status/list | Raw `active`/`inactive`, `Tier ID`, `Level` | Technical state and identifiers dominate the table | Know whether a tier can be assigned and preserve history | Use Vietnamese status labels and explanatory headings |
| `/admin/news` | Article/category access | `Mức độ truy cập`, `VIP`, `SPECIAL`, `INHERIT`, ACL `Phạm vi`, `Loại đối tượng` | Policy terms need context for business users | Decide who can read content and where an ACL applies | Keep contract values but add concise helper text and business labels |
| `/admin/news` | VIP level | Hard-coded options VIP 1/2/3 | Conflicts with dynamic Membership tiers and future tiers | Choose the required access level | Do not change backend contract in this phase; avoid expanding architecture; document as remaining limitation if needed |
| `/admin/news` | Article/category technical fields | Slug, article/category IDs shown in advanced controls | IDs are useful for support but not normal authoring | Title/name is the primary input; slug is generated when possible | Keep generated identifiers secondary and explain them |

## Architecture constraints confirmed

- All mutations remain Callable Function based.
- No client direct write to Membership, News, authorization, or roles.
- Existing permission constants and PermissionGate remain authoritative for UI
  visibility only.
- Membership remains canonical in `memberships/{membershipId}` and
  `membershipTiers/{tierId}`; this audit does not change either schema.
- No Membership integration into the News evaluator is part of this phase.
- No new permission, role, authorization engine, Rule, or backend contract is
  proposed by this audit.

## Implementation boundary

The implementation can be limited to frontend labels, helper text, generated
Membership tier IDs, display formatting, and lightweight UX explanations. The
backend currently requires `tierId` on create, so the frontend must generate a
valid stable ID and continue sending it; update must continue using the existing
immutable document ID. News VIP selection remains constrained by the current
backend contract and must not be redesigned into a second tier engine here.
