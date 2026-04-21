# Kognitos App Template

Project template for building dashboard applications on top of the Kognitos automation platform, using [Next.js](https://nextjs.org/) (App Router), [Lattice UI](https://github.com/kognitos/lattice), and [Cursor](https://cursor.sh/) AI rules.

## Quick Start

```bash
# 1. Clone this template
git clone https://github.com/kognitos/kognitos-app-template.git my-app
cd my-app

# 2. Set up environment
cp .env.example .env
# Edit .env with your Kognitos credentials

# 3. Install Lattice UI (from a local tarball — see below)
#    Add to package.json: "@kognitos/lattice": "file:kognitos-lattice-X.Y.Z.tgz"

# 4. Install dependencies
npm install

# 5. Verify connectivity
npx tsx scripts/verify-connection.ts

# 6. Start developing
npm run dev
```

## Installing Lattice UI

Lattice is not on the public npm registry. Build a tarball from the [Lattice repo](https://github.com/kognitos/lattice):

```bash
git clone https://github.com/kognitos/lattice.git packages/lattice
cd packages/lattice && npm install && npm run build && npm pack
mv kognitos-lattice-*.tgz ../../
cd ../..
```

Then add to `package.json`:

```json
"@kognitos/lattice": "file:kognitos-lattice-1.18.0.tgz"
```

Run `npm install` and verify with `npm ls react` -- every entry should say `deduped`. See `.cursor/rules/05-npm-local-packages.mdc` for details on why tarballs matter.

## Project Structure

```
├── .cursor/rules/         Cursor AI rules (process + technical)
│   ├── 01-workflow.mdc        6-phase build workflow with gates
│   ├── 02-api-discovery.mdc   Kognitos API reference, Phases 1-3
│   ├── 03-planning-build.mdc  Phases 4-6: planning and build
│   ├── 04-lattice-ui.mdc      Lattice UI components, tokens, gotchas
│   ├── 05-npm-local-packages.mdc  Local package install pattern
│   └── 06-chat-support.mdc       Claude + Supabase chat architecture
├── lib/                   Reusable Kognitos utilities
│   ├── kognitos.ts            API client, env validation, req()
│   ├── arrow.ts               Arrow IPC decoding helpers
│   ├── spy.ts                 Inline code execution
│   ├── supabase.ts            Supabase client (anon + admin), table names
│   ├── chat/                  Chat module
│   │   ├── types.ts               ChatSession, ChatMessage, stream event types
│   │   ├── system-prompt.ts       Claude system prompt builder (customize per domain)
│   │   └── chat-context.tsx       React context provider for chat state
│   ├── quill.ts               Quill Chat API + NDJSON parsing
│   └── types.ts               Generic run types (RunState, RawRun)
├── scripts/               Discovery scripts (run with npx tsx)
│   ├── verify-connection.ts   Phase 1: test API connectivity
│   └── decode-outputs.ts      Phase 3: inspect run output schemas
├── supabase/
│   └── migrations/
│       └── 00000000000001_chat.sql  Chat tables schema (rename prefix per project)
├── app/                   Next.js App Router
│   ├── globals.css            Tailwind + Lattice CSS imports + chat markdown styles
│   ├── layout.tsx             Root layout with ThemeProvider + ChatProvider
│   ├── chat/
│   │   └── page.tsx           Chat page UI (message bubbles, streaming, suggestions)
│   └── api/chat/
│       ├── route.ts           Main chat endpoint (Claude streaming + tools + persistence)
│       └── sessions/
│           ├── route.ts       GET (list) + POST (create) sessions
│           └── [id]/route.ts  GET (messages) + PATCH (title) + DELETE
├── next.config.ts         apache-arrow as server external package
├── tsconfig.json          Path aliases, excludes scripts/packages
├── postcss.config.mjs     Tailwind v4 via @tailwindcss/postcss
├── package.json           Dependencies with pinned versions
└── .env.example           Required environment variables
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `KOGNITOS_TOKEN` | Personal access token (`kgn_pat_...`) |
| `KOGNITOS_ORG_ID` | Organization ID |
| `KOGNITOS_WORKSPACE_ID` | Workspace ID |
| `KOGNITOS_BASE_URL` | API base URL (must end with `/api/v1`) |
| `KOGNITOS_AUTOMATION_ID` | Target automation ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |

## Cursor AI Rules

The `.cursor/rules/` directory contains rules that guide Cursor through a 6-phase build process:

1. **Environment Setup** -- API credentials, connectivity verification
2. **Discover Automation** -- Understand the automation in domain language
3. **Inspect Run Outputs** -- Document data schemas from completed runs
4. **Domain Thinking** -- Determine useful insights from actual data
5. **Build Plan** -- Concrete plan of pages, data flow, edge cases
6. **Build the App** -- Implement the plan using Lattice UI

Each phase has a gate requiring user confirmation before proceeding.

## Tech Stack

- **Next.js 15** (App Router) deployed to Vercel
- **TypeScript** -- all code must be `.ts` or `.tsx`
- **Tailwind CSS v4** via PostCSS
- **Lattice UI** (`@kognitos/lattice`) for components and design tokens
- **Recharts v3** for data visualization
- **apache-arrow** for Arrow IPC decoding
- **Claude** (Anthropic SDK) for AI chat with Kognitos API tool calling
- **Supabase** for chat session and message persistence
