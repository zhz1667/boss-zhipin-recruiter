# BOSS Zhipin Recruiter

Codex plugin for operating an authenticated BOSS Zhipin recommendation page:

- select a job
- browse the recommended candidate pool by default
- exclude hot-search recommendation cards that cannot be greeted normally
- collect and deduplicate candidate cards
- inspect candidate resume details by clicking the candidate card directly,
  including Canvas-rendered resumes
- rank candidates against user-provided criteria
- prepare a greeting plan and send only user-confirmed greetings
- use adaptive waits and text-only detail screening for large candidate batches

## Requirements

- Codex Desktop with Computer Use and `cua_repl`
- A logged-in BOSS Zhipin tab in the Codex in-app browser
- Jev configuration and credentials in the user's own configuration directory

The plugin vendors the MIT-licensed Jev browser bridge for reproducible runtime
behavior. It does not include API keys, tokens, cookies, BOSS account data,
resume data, or credential files.

## Install

```powershell
codex plugin marketplace add zhz1667/boss-zhipin-recruiter --ref main
codex plugin add boss-zhipin-recruiter@boss-recruiting
```

Open a new Codex task after installation so the plugin and Skill are reloaded.

## Jev credentials

Each user must configure Jev independently. The plugin reads:

```text
~/.config/jev-browser-use/config.json
```

The referenced `envFile` must exist on that user's machine. Never commit the
credential file, API key, browser cookies, or `auth.json`.

## Default limits

- Collect: 100 candidates by default, up to 1000
- Detailed review: 50 candidates by default, up to 300
- Greeting: 5 candidates by default, up to 20

Greeting is an external communication and always requires explicit confirmation
immediately before sending.

## Development

Run the runtime self-test:

```powershell
node .\plugins\boss-zhipin-recruiter\skills\boss-zhipin-recruiter\scripts\boss-runtime.mjs
```

Validate the plugin:

```powershell
python path\to\plugin-creator\scripts\validate_plugin.py .\plugins\boss-zhipin-recruiter
```
