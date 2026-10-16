This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Environment Variables

<!-- TODO(discord-auth): are these ENV VARs correct? -->

Create a `.env.local` file in the frontend directory with the following variables:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_DISCORD_OAUTH2_CLIENT_ID=your_discord_client_id
NEXT_PUBLIC_DISCORD_OAUTH2_AUTH_URL=https://discord.com/api/oauth2/authorize
```

Note: All frontend environment variables must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser.

## Project structure

- `/src/components/ui` contain ui elements from shadcn library.
- `/src/components` will contain custom project specific components.

## Checks and browser smoke tests

```sh
npm ci
npm run lint
npm run test:unit
npm run build
```

The frontend uses Next.js 15.5.28 and React 19.3.1, including their published
2026-10-14 fixes. Next's nested PostCSS resolves to the same patched 8.x range
as the direct dependency. ESLint checks exclude generated Next output.

The Playwright suite checks production-built pages against a synthetic API on
ports 4300/4301. It covers search URL/history/scope state, delayed pagination,
keyboard audio playback/seeking, profiles/playlists, and unauthenticated routing.
It does not exercise real Discord OAuth, MySQL, or GCS.

```sh
npx playwright install chromium
NEXT_PUBLIC_API_URL=http://127.0.0.1:4301 \
NEXT_PUBLIC_FRONTEND_URL=http://127.0.0.1:4300 \
NEXT_PUBLIC_DISCORD_OAUTH2_CLIENT_ID=smoke-check npm run build
npm run test:e2e
```

Both ports must be available. Tests own and stop their fixture/API processes;
they do not reuse an existing application. Failure traces/screenshots are written
to ignored `test-results/`. CI uses the same build settings and uploads failed
browser artifacts. `npm audit --omit=dev` checks shipped dependencies separately
from development-tool advisory findings.

## Logging

See [application logging conventions](../docs/LOGGING.md) for browser defaults,
server-only logging, redaction and verification commands.
