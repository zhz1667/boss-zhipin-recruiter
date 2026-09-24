# Runtime dependencies

This plugin intentionally does not launch a separate browser driver or store BOSS
credentials. It vendors the MIT-licensed Jev browser `bridge.mjs` and uses that
bundled copy by default for reproducible plugin behavior. Call
`loadJevBridge({ preferBundled: false })` to prefer an installed
`jev-browser-use` copy instead. Its browser execution depends on the Codex host
runtime:

- `cua_repl` for browser tab access and UI actions.
- The `unified-computer-use` runtime exposed by Codex Desktop.
- The vendored or installed `jev-browser-use` bridge for model-assisted
  mechanical actions.
- An authenticated `iab` tab on `https://www.zhipin.com`.

The vendored source revision is recorded in
`vendor/jev-browser-use/SOURCE.json`, and the MIT license is included beside it.
The plugin never copies `config.json`, `credentials.env`, API keys, tokens, or
cookies.

The plugin ships its BOSS-specific logic as `scripts/boss-runtime.mjs`. It uses
the browser API already supplied by `cua_repl`; no separate npm package or
Playwright process is required.

Detailed resume pages can be rendered into a Canvas. The plugin uses CUA
screenshots for visual reading and `PageDown` for deterministic detail paging;
it does not add OCR or a separate rendering dependency.

## Why not bundle a standalone browser process

A separate Playwright process would need its own browser profile, login session,
cookie storage, proxy handling, and CAPTCHA handling. That duplicates the Codex
browser runtime and makes the logged-in BOSS session less reliable.

The plugin therefore separates responsibilities:

- Codex and the plugin Skill own job selection, filtering, user guidance, and
  confirmation gates.
- `boss-runtime.mjs` owns BOSS selectors and deterministic DOM operations.
- `cua_repl` owns access to the authenticated tab.
- The bundled or installed Jev bridge handles suitable model-assisted mechanical
  actions while credentials remain in the user-level Jev configuration.

## API-key authentication

Jev credentials remain in the user-level configuration referenced by
`~/.config/jev-browser-use/config.json`. `inspectJevRuntime` checks only whether
the configured credential file exists. It does not read or print its contents.

When Codex uses API-key authentication, full inventory calls can fail with
`unsupported Codex auth method: apikey`. Connect directly with:

```js
await cua.getTab({ url: 'https://www.zhipin.com/web/chat/recommend' }, { browser: 'iab' });
```

Do not retry inventory calls or report the plugin as missing. Full Computer Use
inventory requires ChatGPT authentication and is a separate environment choice.
