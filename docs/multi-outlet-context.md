# NEXTGEN JFS Middleware — Multi-Outlet Context Architecture

## Purpose
This document specifies the multi-outlet isolation architecture for the JFS Middleware.
The objective is to enable multi-tenant and multi-outlet scraping where each outlet has an isolated context (configuration, credentials, HTTP client, and token refresh manager).

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
- **URL Query Parameters (`?outlet=...`) ARE STRICTLY IGNORED** to prevent parameter override attacks.
- Public clients cannot guess or switch outlet context via URL manipulation.

## State Isolation Rules
1. **Token Isolation**: `authManager` state is unique per context. Modifying token on Outlet A never alters Outlet B.
2. **HTTP Client Isolation**: `httpClient` instances are separate `axios.create()` instances with isolated interceptors.
3. **No Global State Leakage**: New contexts do not write to mutable global variables.
4. **Concurrency Safety**: Asynchronous requests across multiple contexts execute safely in parallel via `Promise.all`.

## Legacy SUM001A Compatibility
- The legacy SUM001A production path (`process.env.AUTH_TOKEN`, global `axios`, `/set-token`) remains intact for backward compatibility.
- New isolated context resolvers operate in parallel without modifying existing legacy routes.

## Next Phases
- **Phase 0E**: Phased migration of operational endpoints (Pickup, Dispatch, COD, etc.) to multi-outlet context resolution.
- **Phase 1+**: Integration with NEXTGEN database credential store (`IntegrationCredential`).
