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
      theme="light"
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
| `theme` | `string \| object` | no | `"system"`, `"light"`, `"dark"`, `"basic`, or a `ThemeOverrides` object |
| `remoteCaptureLibrary` | `boolean` | no | Load the screenshot tooling from `{baseUrl}/widget/` instead of the bundled copies. See [Screenshots](#screenshots) |

## Widget Props

`FeedTideWidget` accepts all provider props above, plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `string` | `"bottom-right"` | Anchor position for the floating button (e.g. `"bottom-right"`, `"top-left"`) |
| `native` | `boolean` | `false` | When `false` (default), loads the remote `embed.js` script. When `true`, renders a self-contained React widget — CSP-safe, no remote scripts, works in Chrome extensions and other restricted environments |
| `remoteCaptureLibrary` | `boolean` | `false` | Overrides the provider value. See [Screenshots](#screenshots) |

```tsx
<FeedTideWidget appId="app_abc123" native />
```

## Screenshots

The feedback form's camera button captures the host page with
[html2canvas](https://html2canvas.hertzen.com), then opens an annotation editor
over the page — pen, highlight, hide (redact), arrow and text, with undo — before
the image is attached to the feedback. Both ship with this package rather than
being fetched from `feedtide.com`.

The whole capture path is behind one dynamic `import()`, so your bundler splits
it into its own chunk and nothing is downloaded until someone actually takes a
screenshot. On `native` that chunk is served from your own origin: no
cross-origin script, and nothing a `script-src 'self'` policy will block. The
default (non-`native`) path runs `embed.js`, which fetches its own copies from
`{baseUrl}/widget/` — it is the same editor source either way, so the two look
and behave identically.

While the capture runs, the widget collapses to its pill so it stays out of the
shot (it is excluded from the image either way) and the user can see where their
feedback went. Cancelling the editor attaches nothing and reports no error.

### Using the server's copy instead

Set `remoteCaptureLibrary` to fetch `{baseUrl}/widget/html2canvas.min.js` and
`{baseUrl}/widget/capture.js` instead, the way `embed.js` does on its own. It
works on both paths — `native` injects the scripts itself, and the default path
simply stops handing `embed.js` a loader.

```tsx
<FeedTideWidget appId="app_abc123" remoteCaptureLibrary />
```

Reach for it when your bundler can't code-split, or when you'd rather the
screenshot tooling track whatever `feedtide.com` serves than the versions pinned
in your lockfile. If a remote script fails to load, the capture falls back to the
bundled copy and logs a warning rather than failing.

Note this doesn't shrink your bundle: the dynamic `import()` still exists in the
source, so your bundler still emits the chunk — the flag only stops it being
fetched.

**Chrome extensions (MV3):** content scripts can't use dynamic `import()` unless
the chunk is listed in `web_accessible_resources`. The usual fix is to build with
`build.rollupOptions.output.inlineDynamicImports` (or let CRXJS handle it), which
folds html2canvas and the editor into the content-script bundle — still no
network fetch, still CSP-clean, just not code-split.

## Vendored files

`src/vendor/capture.js` is the annotation editor, copied **byte-identically**
from the feedtide repo (`packages/api/src/widget/capture.js`) so that `native`
and the `embed.js` path can never render different editors. Its provenance is
recorded in `src/vendor/capture.meta.json`.

It is never edited here, and the sync is driven from the other side — feedtide
owns the file, so it pushes. Fix bugs upstream, then from the feedtide repo:

```bash
pnpm sync:capture:react                                   # into ../feedtide-react
FEEDTIDE_REACT_REPO=path/to/react pnpm sync:capture:react  # into a worktree
```

`test/vendorSync.test.ts` fails if the copy drifts from upstream (it skips when
no feedtide checkout is present — point `FEEDTIDE_REPO` at one to run it), and
`test/captureEditor.test.ts` characterises the behaviour this package depends
on — read it if a sync makes it fail.

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
  theme={{ preset: "dark", primaryColor: "#8b5cf6" }}
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

Run `pnpm test` for the test suite — it builds first, then checks the published
output (html2canvas stays external and lazily imported, the annotation editor
stays in the lazy chunk and out of the eager bundle, no library types leak into
the declarations, `dist` loads with no DOM present, and both bundles stay within
budget) and unit-tests the screenshot capture path, the editor, and the host
message protocol.

Alternatively, use `file:` protocol in your consumer's `package.json`:

```json
{
  "dependencies": {
    "@feedtide/react": "file:/path/to/feedtide-react-lib/packages/react"
  }
}
```

If you get "Invalid hook call" errors, it means duplicate React instances. Verify with `pnpm why react` and ensure only one copy is resolved.
