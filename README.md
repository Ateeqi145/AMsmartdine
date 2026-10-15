# SmartDine Multi-Restaurant

SmartDine multi-restaurant app built with React, TypeScript, Vite, and Convex.

## Main folders

- `src/components/providers/` - application providers
- `src/components/ui/` - reusable interface components
- `src/hooks/` and `src/lib/` - shared client utilities
- `src/pages/` - authentication, manager, super-admin, and table views
- `convex/` - schema, backend modules, and generated Convex bindings
- `public/` - static assets

## Run locally

Install dependencies with `npm install`, set up the Convex Auth signing keys on the development deployment, run `npx convex dev`, then run `npm run dev` in a second terminal.

Copy `.env.example` to `.env.local` and set `VITE_CONVEX_URL` to the Convex deployment URL. Sign-in uses Convex Auth email and password; no external OIDC account is required. Convex Auth also requires `JWT_PRIVATE_KEY` and `JWKS` environment variables on the Convex deployment. Restart Vite after changing environment values.

On a new deployment, create the first account from the sign-in dialog, then promote that account to `SUPER_ADMIN` in the Convex dashboard under **Data → users**. New accounts otherwise remain on the pending-access screen until an administrator assigns a role. This password setup does not yet verify email addresses or provide password resets; configure those before using it for production accounts.

## Commands

- `npm run dev` - start the Vite development server
- `npm run build` - type-check and build for production
- `npm test` - run Vitest