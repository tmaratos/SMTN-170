# Squadron Templates

This folder holds the **PowerPoint** and **Word (letter / memorandum)** templates
that are linked directly from the **CAP References** page (`resources.html`) for
one-click download by squadron members.

Files placed here are served as static files from GitHub Pages — no extra
configuration is required.

## Files currently present

### PowerPoint

- `PPT Template (3).pptx` — Official squadron PowerPoint template members should
  follow for any presentation. (Exposed as **PowerPoint Template** on the CAP
  References page.)

### Letter & Memorandum (Word)

- `Letter__Memorandum_Style_Without_Le_959B28EAE6773.docx` — Memorandum Style —
  Without Letterhead.
- `Letter__Memorandum_Style_With_Lette_DB21029482BCE.docx` — Memorandum Style —
  With Letterhead.
- `Letter__Business_Style_Without_Lett_37348C4DB8227 (2).docx` — Business Letter
  — Without Letterhead.
- `Letter__Transportation_Authorizatio_19737C5D9D705.docx` — Transportation
  Authorization Letter.

## How to add a new template (for command staff)

1. Drop the file into this folder. Spaces and parentheses in the filename are
   OK — just URL-encode them in the `href` (`" "` → `%20`, `"("` → `%28`,
   `")"` → `%29`).
2. Open `resources.html` at the repo root.
3. Find the `<!-- squadron templates -->` section near the top of
   `.cap-ref-sections`.
4. Inside the matching group (PowerPoint / Letter & Memorandum), add a new
   link using the pattern below — replace `FILENAME.EXT`, the label, and the
   `download` value:

   ```html
   <a class="cap-ref-btn"
      href="./assets/templates/FILENAME.EXT"
      download="Clean_Filename.ext">
     <span class="cap-ref-btn-label">
       Short title
       <span class="cap-ref-btn-type is-docx">DOCX</span>
     </span>
     <span class="cap-ref-btn-desc">One-line description.</span>
   </a>
   ```

5. Commit and push. The link goes live on the next GitHub Pages deploy.

## Notes

- Use the `download` attribute so the browser saves the file instead of
  trying to open it inline. Give it a clean, human-friendly filename
  (e.g. `download="Memorandum_With_Letterhead.docx"`).
- Use **relative paths** (`./assets/templates/...`) so links work in every
  environment (local preview, GitHub Pages, Firebase Hosting).
- Do **not** store sensitive PII or member rosters in this folder — these
  files are publicly accessible.
