# Chart Decoder — Phase 1

A medical terminology game for health informatics students and IT professionals new to health. Learn the language of the chart, one condition at a time. Phase 1 starts with hypertension (HTN).

## What's in Phase 1

- **Bootcamp:** an optional warm-up on word parts, common abbreviations and how a note is organized
- **Decoder mode:** see a term in a chart line and pick its meaning (and sometimes the reverse)
- **Grid sort mode:** sort terms into categories (disease, medication, sign/symptom, lab/test, abbreviation)
- **Progression:** Basic → Intermediate → Advanced. Score 80% or better on a decoder round to move up. Missed terms come back later in the round and show up more often in future rounds; about 20% of each round reviews earlier levels.
- **Filters:** condition, category and level
- **Personal bests**, saved in the player's own browser (no accounts)

## Project files

```
index.html               page shell
styles.css               look and feel (light and dark mode)
app.js                   game engine; settings are in CONFIG at the top
content/
  terms.csv              the terms the game plays with (exported from the master term list)
  terms-fallback.js      backup copy of terms.csv for opening the page straight from disk
  bootcamp.js            bootcamp units: word parts, abbreviations, note sections
  Chart_Decoder_Master_Term_List.xlsx   the master term list you edit
tools/
  sync_fallback.py       refreshes terms-fallback.js after you update terms.csv
```

## Run it in VS Code

1. Open this folder in VS Code (**File → Open Folder**).
2. Install the **Live Server** extension if you haven't.
3. Right-click `index.html` → **Open with Live Server**. The game opens in your browser and reloads when you save.

Opening `index.html` directly (double-clicking) also works, but it uses the backup copy of the terms instead of `terms.csv`.

## Add or change terms

1. Edit the **Terms** sheet in `content/Chart_Decoder_Master_Term_List.xlsx`. Keep the column headers as they are.
2. Export that sheet as CSV (**File → Save As → CSV UTF-8**) and save it over `content/terms.csv`.
3. Optional: run `python tools/sync_fallback.py` so the backup copy matches.

A new condition (e.g., DM) appears in the game once it has at least 8 of its own terms. Terms marked **Condition = All** appear in every condition, and **All** abbreviations also feed the bootcamp.

To hide unverified terms, set `includeStatuses: ["Verified"]` in `CONFIG` in `app.js`.

## Publish on GitHub Pages

1. Commit and push this folder to a GitHub repo.
2. In the repo on GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main` and `/ (root)`, then **Save**.
3. Your game will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Sources

Terms are drawn from ICD-10-CM (diagnoses), RxNorm (medications) and example clinical notes. Starter rows are drafts: verify each against its source.
