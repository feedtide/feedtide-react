# @feedtide/react

React components and hooks for FeedTide feedback widgets.

## Installation

```bash
pnpm add @feedtide/react
```

## Quick Start

### Standalone (simplest)

For a single widget with no hooks, pass config directly — no provider needed:

```tsx
import { FeedTideWidget } from '@feedtide/react';

function App() {
  return (
    <FeedTideWidget
      appId="app_abc123"
      userId="user_456"
      signature="hmac_sig_here"
      position="bottom-right"
      theme="shiny-light"
    />
  );
}
```

### With Provider

Use the provider when you need hooks (`useFeatures`, `useVote`, `useFeedback`) or multiple components sharing the same config:

```tsx
import { FeedTideProvider, FeedTideWidget } from '@feedtide/react';

function App() {
  return (
    <FeedTideProvider
      appId="app_abc123"
      userId="user_456"
      signature="hmac_sig_here"
    >
      <FeedTideWidget position="bottom-right" theme="shiny-light" />
    </FeedTideProvider>
  );
}
```

Props passed directly to `FeedTideWidget` override provider values, so you can mix both — e.g., use the provider for `appId`/`signature` but override `theme` per-widget.

## Provider Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `appId` | `string` | yes | Your FeedTide app ID |
| `userId` | `string` | no | User identifier. Omit for anonymous mode (generates fingerprint) |
| `signature` | `string` | no | HMAC signature. Required unless anonymous voting is enabled |
| `userEmail` | `string` | no | Optional user email passed with votes/feedback |
| `userName` | `string` | no | Optional user name passed with votes/feedback |
| `baseUrl` | `string` | no | API base URL (defaults to relative, i.e. same origin) |
| `theme` | `string \| object` | no | `"default"`, `"shiny-light"`, `"shiny-dark"`, or a `ThemeOverrides` object |

## Components

- **`FeedTideWidget`** — Full floating button + panel (drop-in replacement for the embed script). Accepts all provider props directly for standalone use.
- **`FeatureList`** — Renders all features with vote buttons
- **`FeatureCard`** — Single feature with status badge and vote button
- **`FeedbackForm`** — Textarea with submit and success state
- **`VoteButton`** — Upvote triangle + count, handles toggle

## Hooks

- **`useFeedTide()`** — Access the client, config, and resolved theme (requires provider)
- **`useFeedTideOptional()`** — Same as `useFeedTide()` but returns `null` when no provider exists
- **`useFeatures()`** — `{ features, isLoading, error, refetch }`
- **`useVote(featureId, initialVoted, initialCount)`** — `{ vote, isVoting, hasVoted, voteCount }` with optimistic updates
- **`useFeedback()`** — `{ submit, isSubmitting, isSuccess, error, reset }`

## Themes

Three built-in presets: `default`, `shiny-light`, `shiny-dark`.

Override specific colors:

```tsx
<FeedTideProvider
  appId="app_abc123"
  theme={{ preset: "shiny-dark", primaryColor: "#8b5cf6" }}
>
```

## Local Development

During development, link the package into another React project:

```bash
# In packages/react — register the link
pnpm link --global

# In your React app — consume it
pnpm link --global @feedtide/react
```

Run `pnpm dev` in `packages/react` to watch for changes and rebuild automatically.

Alternatively, use `file:` protocol in your consumer's `package.json`:

```json
{
  "dependencies": {
    "@feedtide/react": "file:/path/to/feedtide-react-lib/packages/react"
  }
}
```

If you get "Invalid hook call" errors, it means duplicate React instances. Verify with `pnpm why react` and ensure only one copy is resolved.
