# D4 — Application architecture: modular monolith

One NestJS app whose modules map onto bounded contexts (Catalog, Inventory, Cart/Checkout, Orders, Payments, Customers, Pricing/Promotions, Shipping/Fulfillment, Tax). Keeps transactional consistency (order + payment + inventory side effects in one DB transaction) and low operational overhead; a context can be extracted into a service later if it needs independent scaling. Modeling: customers belong to a tenant (not the platform); staff users are many-to-many with tenants and kept separate from storefront customers.

*Rejected:* microservices from the start — premature at this scale, adds distributed-transaction and ops complexity with no offsetting benefit.
