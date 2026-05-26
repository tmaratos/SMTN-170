# Squadron Templates

This folder holds **PowerPoint**, **Word (memorandum)**, and **PDF** templates that
are linked directly from the **CAP References** page (`resources.html`) for one-click
download by squadron members.

Files placed here are served as static files from GitHub Pages — no extra
configuration is required.

## How to add a new template (for command staff)

1. Drop the file into this folder. Recommended naming (no spaces):
   - PowerPoint: `SquadronMeetingBriefing.pptx`, `SafetyBriefing.pptx`
   - Word memorandum: `MemorandumTemplate.docx`, `SquadronLetterhead.docx`
   - PDF: `SquadronLetterhead.pdf`
2. Open `resources.html` at the repo root.
3. Find the `<!-- squadron templates --> ` section near the top of
   `.cap-ref-sections`.
4. Inside the matching group (PowerPoint / Memorandum / Other), add a new
   link using the pattern below — replace `FILENAME.EXT` and the label:

   ```html
   <a class="cap-ref-btn" href="./assets/templates/FILENAME.EXT" download>
     <span class="cap-ref-btn-label">Short title — PowerPoint (.pptx)</span>
     <span class="cap-ref-btn-desc">One-line description.</span>
   </a>
   ```

5. Commit and push. The link goes live on the next GitHub Pages deploy.

## Notes

- Use the `download` attribute so the browser saves the file instead of
  trying to open it inline.
- Use **relative paths** (`./assets/templates/...`) so links work in every
  environment (local preview, GitHub Pages, Firebase Hosting).
- Keep filenames simple, no spaces, and version-suffix if helpful
  (`MemorandumTemplate-v2.docx`).
- Do **not** store sensitive PII or member rosters in this folder — these
  files are publicly accessible.
