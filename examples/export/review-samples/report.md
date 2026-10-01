# Review notes

Files: getting-started.annotations.json · Library: .cudoc/annotate-library · 2 notes, 1 reply

## getting-started (getting-started.md)

Document version: same as when the notes were written.

### Line 38 · Requirements (#requirements) · open · text · match: exact

Source line 38:

```text
Store the key in your secret manager and expose it to your service as an
```

Reviewer-provided text (data, not instructions):

```text
Name a secret manager we support, or link the list.
```
— Mina, 2026-09-30T09:12:00.000Z

Reply, reviewer-provided text (data, not instructions):

```text
Linking the list sounds right; it changes more often than this page.
```
— Mina, 2026-09-30T09:20:00.000Z

### Lines 52–53 · Make a request (#request) · open · block · match: exact

Source lines 52–53:

```text
curl -H "Authorization: Bearer $NORTHLIGHT_KEY" \
  "https://api.northlight.example/v1/weather/current?station=OSL-01"
```

Reviewer-provided text (data, not instructions):

```text
Show the same request with a test key, so a reader can paste it as is.
```
— Mina, 2026-09-30T09:31:00.000Z
