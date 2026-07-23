# D5 — Vendor-agnostic external providers via ports & adapters

Every external capability (payments, shipping, tax, notifications, storage, search) is a **domain-owned port** with **adapters** at the edge; a **registry resolves the adapter per tenant** from config. Shared contract: `Money` as integer minor units; opaque `ProviderRef` persisted by us (no vendor blobs in domain tables); an `idempotencyKey` on every mutation; async providers expose `parseEvent → NormalizedEvent` with a `providerEventId` (dedupe) and refs for tenant attribution; normalized error taxonomy with a `retryable` flag. Design each port against two hypothetical providers so it doesn't encode one vendor's model. Note: external search has no RLS, so the `SearchPort` must enforce tenant scoping itself.

*Rejected:* vendor SDKs in domain code (lock-in, leaked types); a single fixed provider per capability (incompatible with per-tenant choice).

See [D7](d7-payment-port.md) for a worked example (`PaymentPort`).
