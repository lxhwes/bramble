# The name dataset

`static/names.json` is committed, so nothing below is needed to run or deploy
Bramble. It matters only if you want to change the dataset itself — widen the
year range, adjust the popularity floor, or refresh from upstream.

## What ships

6,347 entries, about 778 KB, sorted by name:

```json
{
	"name": "Aaden",
	"sex": "M",
	"peakYear": 2009,
	"totalCount": 5064,
	"related": ["Aden", "Aidan", "Aiden", "Aydan", "Ayden"]
}
```

`related` is present on roughly half the entries — it comes from the Behind the
Name enrichment step, which is optional (see below). The file is served straight
from the CDN edge or the container's static directory; there are no runtime API
calls.

## Sources

| Source | License | Provides | Fetched |
|---|---|---|---|
| [US Social Security Administration](https://www.ssa.gov/oact/babynames/) national data | Public domain | `name`, `sex`, `peakYear`, `totalCount` | Automatically |
| [Behind the Name](https://www.behindthename.com/) bulk export | CC BY-SA 4.0 | `related` | Manually |

The Behind the Name bulk export declares CC BY-SA 4.0 in its own file header,
which is a separate grant from the terms on the BTN website. That license is why
the bundled dataset is CC BY-SA 4.0 while the app code is MIT, and why
attribution is rendered in-app on the About page.

## Rebuilding

```bash
pnpm build:names
```

Requirements:

- Network access to `ssa.gov`
- The system `unzip` binary — standard on macOS and Linux. The script shells out
  to it rather than taking on a zip library for a build-time-only step.

The script downloads `names.zip` into `data/ssa/`, extracts it, and caches both.
Re-runs skip the download when the zip is already there, so delete `data/ssa/`
to force a refresh. All of `data/` is gitignored.

Current filters, at the top of `scripts/build-names.ts`:

| Constant | Value | Effect |
|---|---|---|
| `YEAR_START` | 1995 | First SSA year considered |
| `YEAR_END` | 2024 | Last SSA year considered |
| `MIN_COUNT_ANY_YEAR` | 100 | A name must hit this in at least one year to be included |

`MIN_COUNT_ANY_YEAR` is what keeps the file small enough to ship to a phone.
Lowering it grows both the deck and the download.

## Behind the Name enrichment

This step is optional. Without it `pnpm build:names` prints
`No data/btn/ directory found; skipping BTN enrichment` and produces a complete
dataset with no `related` fields — every feature still works except related-name
suggestions.

To include it, download the bulk synonyms export from Behind the Name and place
the `.txt` file(s) in `data/btn/`. The script reads every `.txt` in that
directory. Expected format is a `#`-prefixed comment header followed by
tab-separated rows:

```text
# ...header comments...
Aaden	m	Aden,Aidan,Aiden,Aydan,Ayden
```

That is `<name>`, `<gender>`, `<comma-separated related names>`. Only the
processed `static/names.json` is ever committed; the raw export is not
redistributed here.

## If you change the dataset

Keep the CC BY-SA attribution intact. `static/names.LICENSE.txt` travels with
the built app, and the About page credits both sources — a rebuild that drops
either would make the app's own disclosure false.
