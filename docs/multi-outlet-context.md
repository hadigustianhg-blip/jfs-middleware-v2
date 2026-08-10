# NEXTGEN JFS Middleware — Multi-Outlet Context Architecture

## Purpose
This document specifies the multi-outlet isolation architecture for the JFS Middleware.
The objective is to enable multi-tenant and multi-outlet scraping where each outlet has an isolated context (configuration, credentials, HTTP client, and token refresh manager).

## Credential Architecture (`credentialRef` & Server Secret Resolver)
To ensure strict security and prevent credential leakage, **`JFS_CONTEXTS_JSON` MUST NOT contain secret tokens or passwords**.
Instead, context definitions specify a controlled `credentialRef`:

```json
{
  "key": "staging-sum001a",
  "tenantId": "tenant-a",
  "outletId": "outlet-a",
  "outletCode": "SUM001A",
  "networkCode": "SUM001A",
  "financeCode": "BDO000",
  "financeId": 183,
  "scanSiteCode": "SUM001A",
  "credentialRef": "SUM001A"
}
```

### Server-Side Secret Resolution
1. `credentialRef` is validated server-side (alphanumeric, underscore, hyphen only).
2. The secret token is resolved using controlled prefix `JFS_CONTEXT_TOKEN_<CREDENTIAL_REF>` from environment variables.
   Example: `credentialRef: "SUM001A"` $\rightarrow$ reads `JFS_CONTEXT_TOKEN_SUM001A`.
3. Arbitrary environment variable name lookups (e.g. `credentialRef: "DATABASE_URL"`) are strictly prevented by the controlled prefix structure.
4. Resolved tokens are passed directly to the context's private `authManager` and are **NEVER** stored on the context or definition object.

### Future Database Integration Note
This environment-backed credential resolution is a **transitional Phase 0 architecture**. In future phases, `resolveContextCredential` will be extended to fetch encrypted credentials directly from NEXTGEN PostgreSQL database (`IntegrationCredential` table).

## Feature Flag & Opt-In Runtime Bootstrap
The multi-outlet execution path is strictly **OPT-IN** and disabled by default.

### Environment Configuration
- **`JFS_MULTI_OUTLET_INTERNAL_ENABLED`**: Boolean flag (`false` by default). Set to `true`, `1`, or `yes` to enable.
- **`JFS_AUTH_KEY`**: Secret internal caller authentication key required for Layer 1 security.
- **`JFS_CONTEXTS_JSON`**: Trusted JSON array defining outlet contexts and internal keys.
- **`JFS_CONTEXT_TOKEN_<CREDENTIAL_REF>`**: Controlled environment variable containing the secret token for each `credentialRef`.

### Default OFF Behavior
When `JFS_MULTI_OUTLET_INTERNAL_ENABLED=false` (or missing):
- No context definitions are parsed.
- No outlet contexts are bootstrapped.
- Internal pilot routes (`/internal/v1/*`) are **NOT mounted** (requests return 404).
- The server runs 100% identically to legacy production SUM001A.

## Core Architecture
Each outlet context is represented by an immutable `JfsOutletContext` object:
```
Outlet Context
├── tenantId
├── outletId
├── outletCode
├── config (networkCode, financeCode, financeId, scanSiteCode)
├── authManager (isolated JfsAuthManager instance)
├── getAuthToken()
└── httpClient (isolated Axios instance)
```

## Security & Trusted Caller Model (2-Layer Security)
Context resolution is strictly enforced on the server-side:
1. **Layer 1 (Caller Authentication)**: Verification of caller identity via `X-Auth-Key`.
2. **Layer 2 (Outlet Context Identity)**: Resolution of active outlet context via `X-JFS-Context-Key` header.

### Context Key Rules
- Context keys are opaque, internal secret identifiers (e.g. UUID).
- Context keys are passed **ONLY via HTTP Headers** (`X-JFS-Context-Key`).
- **URL Query Parameters (`?outlet=...`) and Request Body fields ARE STRICTLY IGNORED**.
- Public clients cannot guess or switch outlet context via URL or payload manipulation.

## State Isolation Rules
1. **Token Isolation**: `authManager` state is unique per context. Modifying token on Outlet A never alters Outlet B.
2. **HTTP Client Isolation**: `httpClient` instances are separate `axios.create()` instances with isolated interceptors.
3. **No Global State Leakage**: New contexts do not write to mutable global variables.
4. **Concurrency Safety**: Asynchronous requests across multiple contexts execute safely in parallel via `Promise.all`.

## Legacy SUM001A Compatibility
- The legacy SUM001A production path (`process.env.AUTH_TOKEN`, global `axios`, `/set-token`) remains intact for backward compatibility.
- New isolated context resolvers operate in parallel without modifying existing legacy routes.
