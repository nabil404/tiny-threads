# D6 — Orders modeled as three coordinated state machines

An order carries three independently-changing concerns, so it is **three sub-machines as separate columns** plus a per-shipment entity, not one flat enum:

- **Lifecycle** (`status`): `pending → confirmed → completed`, `cancelled` as the pre-completion exit.
- **Payment** (`payment_status`): `pending → authorized → partially_captured → paid → partially_refunded → refunded`, plus `voided`/`failed`/`disputed`/`charged_back`; driven by payment-port events. `partially_captured` exists to support per-store authorize-then-capture with multi-shipment.
- **Fulfillment** (`fulfillment_status`): **derived** from `shipments` (`pending → shipped → delivered`, `returned`) as `unfulfilled / partially_fulfilled / fulfilled`.

Product parameters: capture timing is per-store config (`authorize_then_capture` | `immediate`); fulfillment is partial/multi-shipment per line item; one standard flow for all merchants. The machine is a pure guarded `(state, event) => nextState | IllegalTransition`; every transition writes an append-only `order_events` row (audit trail + idempotency via `unique (tenant_id, provider_event_id)`); side effects run in the same transaction; the machine emits to the payment port rather than owning payouts.

*Rejected:* single flat `status` enum (collapses under real commerce); immediate-capture-only / single-shipment-only / per-merchant configurable flows (per the product parameters).
