# @feedtide/react

React components and hooks for FeedTide feedback widgets.

## Installation

```bash
pnpm add @feedtide/react
```

## Quick Start

Drop-in widget (floating button + panel):

```tsx
import { FeedTideProvider, FeedTideWidget } from '@feedtide/react';

function App() {
  return (
    <FeedTideProvider
      appId="app_abc123"
      userId="user_456"
      signature="hmac_sig_here"
      baseUrl="https://feedtide.com"
    >
      <FeedTideWidget position="bottom-right" theme="shiny-light" />
    </FeedTideProvider>
  );
}
```

## Headless Usage

Use the hooks directly to build your own UI:

```tsx
import { FeedTideProvider, useFeatures, useVote, useFeedback } from '@feedtide/react';

function MyFeatureBoard() {
  const { features, isLoading, error, refetch } = useFeatures();

  return (
    <ul>
      {features.map((f) => (
        <li key={f.id}>
          <VoteCell featureId={f.id} voted={f.hasVoted} count={f.vote_count} />
          {f.title}
        </li>
      ))}
    </ul>
  );
}

function VoteCell({ featureId, voted, count }: { featureId: string; voted: boolean; count: number }) {
  const { vote, isVoting, hasVoted, voteCount } = useVote(featureId, voted, count);
  return <button onClick={vote} disabled={isVoting}>{hasVoted ? '▲' : '△'} {voteCount}</button>;
}

function MyFeedbackBox() {
  const { submit, isSubmitting, isSuccess, error, reset } = useFeedback();
  // ...
}
```

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

- **`FeedTideWidget`** — Full floating button + panel (drop-in replacement for the embed script)
- **`FeatureList`** — Renders all features with vote buttons
- **`FeatureCard`** — Single feature with status badge and vote button
- **`FeedbackForm`** — Textarea with submit and success state
- **`VoteButton`** — Upvote triangle + count, handles toggle

## Hooks

- **`useFeedTide()`** — Access the client, config, and resolved theme
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
