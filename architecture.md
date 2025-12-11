=== Log Entry: 2025-12-11T13:47:59 ===

CODEBASE STUDY COMPLETED - Shopify Next.js App Template

PROJECT OVERVIEW:
- Next.js 15 app router with Shopify embedded app template
- Deployed on Vercel with PostgreSQL database
- Uses pnpm for package management

TECH STACK:
- Next.js 15.5.7 with App Router
- React 19.2.0
- Shopify API Library v12.0.0
- Shopify App Bridge React v4.2.5
- Shopify Polaris v13.9.5 (UI components)
- Prisma 6.17.0 (PostgreSQL ORM)
- Tanstack Query v5.90.2
- Tailwind CSS v4.1.14
- GraphQL Codegen for typed queries

DIRECTORY STRUCTURE:
web/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   │   ├── hello/         # Example authenticated API route
│   │   └── webhooks/      # Webhook processing endpoint
│   ├── hooks/             # Custom React hooks (useGraphQL)
│   ├── providers/         # Context providers (Polaris, Tanstack, Session)
│   ├── new/               # Example nested page
│   ├── layout.tsx         # Root layout with App Bridge script
│   ├── page.tsx           # Server component entry
│   └── client.page.tsx    # Main UI with Polaris cards
├── lib/
│   ├── db/                # Database utilities
│   │   ├── prisma-connect.ts      # Prisma client singleton
│   │   ├── session-storage.ts     # Session CRUD operations
│   │   └── app-installations.ts   # App installation tracking
│   ├── shopify/           # Shopify integration
│   │   ├── initialize-context.ts  # Lazy Shopify API init
│   │   ├── verify.ts              # Token exchange & validation
│   │   ├── register-webhooks.ts   # Webhook registration
│   │   └── gdpr.ts                # GDPR mandatory webhooks
│   ├── gql/               # Generated GraphQL types (graphql-codegen)
│   └── get-products.ts    # Example server-side GraphQL query
├── prisma/
│   └── schema.prisma      # Session, OnlineAccessInfo, AssociatedUser models
└── middleware.ts          # CSP headers for embedded app

AUTHENTICATION FLOW:
1. App Bridge v4 provides ID token on client side
2. SessionProvider calls storeToken() on mount to exchange & store token
3. Token exchange uses Shopify API's tokenExchange method
4. Sessions stored in PostgreSQL via Prisma
5. API routes verify session via verifyRequest()

CURRENT FEATURES:
- OAuth/token exchange authentication
- Session management with Prisma
- Webhook registration (APP_UNINSTALLED, GDPR mandatory)
- Example API route (/api/hello)
- GraphQL queries via Tanstack Query hook
- Direct Shopify Admin API access via App Bridge
- Polaris UI components
- Tailwind CSS styling

WEBHOOKS CONFIGURED:
- APP_UNINSTALLED: Cleans up sessions on app uninstall
- CUSTOMERS_DATA_REQUEST: GDPR customer data request
- CUSTOMERS_REDACT: GDPR customer data deletion
- SHOP_REDACT: GDPR shop data deletion

READY FOR FEATURE DEVELOPMENT ✓