# Obsidian CloudFlare Sync

Sync your Obsidian vault to **Cloudflare R2** in near-real-time, with optional **Git backup** for redundancy.

## Features

- **Live R2 sync** -- event-driven sync triggers on every vault change, with a configurable interval (default 30s) to batch uploads
- **Three-way merge** -- compares local content hash, remote ETag, and last-known sync state to detect conflicts
- **Conflict resolution** -- when both sides change, a modal lets you Keep Local, Keep Remote, or Keep Both
- **Git backup** (desktop only) -- on-demand snapshots via ribbon icon; commits and pushes your entire vault to a remote repository
- **Mobile support** -- R2 sync works on mobile; Git features are hidden automatically

## Setup

### 1. Install the plugin

Clone this repo into your vault's `.obsidian/plugins/` directory and build:

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/nearcoast/Obsidian_CloudFlare_Sync.git remote-sync
cd remote-sync
npm install
npm run build
```

Enable **Remote Sync** in Obsidian's Community Plugins settings.

### 2. Configure R2

You need a Cloudflare R2 bucket and an API token with read/write access.

In the plugin settings, fill in:

| Setting | Description |
|---------|-------------|
| Account ID | Your Cloudflare account ID |
| Access Key ID | R2 API token access key |
| Secret Access Key | R2 API token secret |
| Bucket Name | Name of your R2 bucket |
| Jurisdiction | (Optional) `eu` for EU data residency |

Use **Test Connection** to verify credentials before enabling sync.

### 3. Configure Git (optional, desktop only)

| Setting | Description |
|---------|-------------|
| Enable Git Backup | Toggle Git integration on/off |
| Repository Path | Path to your vault's Git repo (defaults to vault root) |
| Remote Name | Git remote name (default: `origin`) |
| Branch | Branch to push to (default: `main`) |
| Author Name | Name for Git commits |
| Author Email | Email for Git commits |

Click the Git ribbon icon to commit and push a snapshot at any time.

## How it works

1. **Vault events** (create, modify, delete, rename) queue changed files
2. On each **sync cycle** (every 30s by default), the engine:
   - Hashes local files and compares against stored sync state and remote ETags
   - Uploads new/modified local files to R2
   - Downloads new/modified remote files from R2
   - Deletes remote files that were deleted locally (and vice versa)
   - Prompts for conflict resolution when both sides changed
3. **Git backup** (if enabled) fires after successful R2 sync cycles as a non-blocking commit + push

Sync state is persisted locally so the plugin can resume correctly after restart.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

MIT
