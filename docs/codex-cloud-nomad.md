# Codex Cloud NOMAD Control

This repo includes `scripts/nomadctl.mjs`, a small command-line helper for Codex Cloud tasks that need to inspect or update the live NOMAD/TREK app.

## Goal

Use Codex Cloud from a phone to ask for live trip changes such as:

- list trips and place counts
- search for real-world places
- add deduped places to trip `1`
- update notes, addresses, Google place IDs, categories, websites, and phones
- check for missing notes or missing Google links

## Codex Cloud Setup

1. Open [Codex](https://chatgpt.com/codex).
2. Connect the GitHub repo `dieegomc18/NOMAD`.
3. Create or edit the Codex Cloud environment for this repo.
4. Enable agent internet access so the task can reach:
   - `https://nomad-production-a78e.up.railway.app`
5. Add these environment variables:
   - `NOMAD_BASE_URL=https://nomad-production-a78e.up.railway.app`
   - `NOMAD_TRIP_ID=1`
   - `NOMAD_EMAIL=<your NOMAD login email>`
   - `NOMAD_PASSWORD=<your NOMAD password>`

If Codex Cloud supports domain allowlisting in your UI, limit internet access to the Railway domain above.

## First Test From Phone

Start a Codex Cloud task with:

```text
Use scripts/nomadctl.mjs to verify live NOMAD access. Run:
node scripts/nomadctl.mjs summary
Do not modify any data. Report the trip title, place count, missing notes count, missing Google place ID count, and image count.
```

Expected result for the NYC trip should be a summary for `NYC w Dad`.

## Common Commands

```bash
node scripts/nomadctl.mjs health
node scripts/nomadctl.mjs trips
node scripts/nomadctl.mjs summary
node scripts/nomadctl.mjs places --trip 1
node scripts/nomadctl.mjs search-place "Joe & The Juice Spring Street New York"
node scripts/nomadctl.mjs clear-images
```

Add one place:

```bash
node scripts/nomadctl.mjs add-place \
  --name "Example Cafe" \
  --category cafe \
  --address "123 Example St, New York, NY" \
  --lat 40.0 \
  --lng -73.0 \
  --google-place-id "google_place_id_here" \
  --notes "Why this is worth keeping."
```

Add multiple places from JSON:

```bash
node scripts/nomadctl.mjs add-places-json places.json
```

The JSON can be either an array or an object with a `places` array:

```json
[
  {
    "name": "Example Cafe",
    "category": "cafe",
    "address": "123 Example St, New York, NY",
    "lat": 40.0,
    "lng": -73.0,
    "google_place_id": "google_place_id_here",
    "notes": "Known for coffee and pastries."
  }
]
```

## Safety Rules For Codex Cloud Prompts

Use prompts like this:

```text
Use scripts/nomadctl.mjs against the live NOMAD trip. Before creating anything, run summary and places, dedupe by normalized name, and search for real-world place data. Add only missing places. Update existing places instead of duplicating. Every place must have notes. Report every create/update action at the end.
```

Avoid prompts that say only "add these" without asking for dedupe and verification.

## Cleanup Commands

Clear generated Google/Places images while keeping categories:

```bash
node scripts/nomadctl.mjs clear-images
```

Fill placeholder notes for anything that somehow has no note:

```bash
node scripts/nomadctl.mjs ensure-notes
```

Delete an accidental place only when you are sure:

```bash
node scripts/nomadctl.mjs delete-place --id 123
```

## Security Notes

- Prefer a dedicated NOMAD account or dedicated token if you later add one for automation.
- If you suspect the credentials leaked, change the NOMAD password immediately.
- Keep the Railway volume mounted at `/app/data` before making heavy changes.
- Create a manual backup before large batch updates.
