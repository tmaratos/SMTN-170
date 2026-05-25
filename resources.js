(function initResourcesPage() {
  const STORAGE_KEY = "smtn170_resources";
  const root = document.getElementById("resourceSections");
  const addSectionForm = document.getElementById("addSectionForm");

  if (!root || !addSectionForm) return;

  const DEFAULT_SECTIONS = [
    { name: "Schedules", description: "Monthly templates and previous schedule exports." },
    { name: "Safety", description: "Safety briefing notes and recurring safety references." },
    { name: "Aerospace Education", description: "AEX, STEM, lesson planning, and activity resources." },
    { name: "Training", description: "Training nights, leadership lessons, and meeting plans." },
    { name: "Forms", description: "Frequently used local forms and shared templates." },
    { name: "External Links", description: "BAND, CAP references, and approved support resources." },
  ];

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        sections: DEFAULT_SECTIONS.map((s) => ({
          id: uid(),
          name: s.name,
          description: s.description,
          builtin: true,
          docs: [],
        })),
      };
    }
    try {
      const data = JSON.parse(raw);
      if (!data.sections || !Array.isArray(data.sections)) throw new Error("invalid");
      return data;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return {
        sections: DEFAULT_SECTIONS.map((s) => ({
          id: uid(),
          name: s.name,
          description: s.description,
          builtin: true,
          docs: [],
        })),
      };
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function renderDoc(doc) {
    const link = doc.url
      ? `<a class="resource-doc-link" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer">Open link</a>`
      : "";
    const notes = doc.notes ? `<p class="resource-doc-notes">${escapeHtml(doc.notes)}</p>` : "";

    return `
      <li class="resource-doc" data-doc-id="${doc.id}">
        <div class="resource-doc-body">
          <strong>${escapeHtml(doc.title)}</strong>
          ${notes}
          ${link}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="remove-doc" data-doc-id="${doc.id}" aria-label="Remove document">Remove</button>
      </li>
    `;
  }

  function renderSection(section) {
    const docs = section.docs.length
      ? section.docs.map(renderDoc).join("")
      : `<li class="resource-doc resource-doc--empty">No documents yet. Add one below so nothing gets lost.</li>`;

    const removeSectionBtn = section.builtin
      ? ""
      : `<button type="button" class="btn btn-ghost btn-sm" data-action="remove-section" data-section-id="${section.id}">Remove section</button>`;

    return `
      <article class="card panel resource-section" data-section-id="${section.id}">
        <div class="resource-section-head">
          <div>
            <h2>${escapeHtml(section.name)}</h2>
            <p>${escapeHtml(section.description || "")}</p>
            <span class="resource-count">${section.docs.length} document${section.docs.length === 1 ? "" : "s"}</span>
          </div>
          ${removeSectionBtn}
        </div>
        <ul class="resource-doc-list">${docs}</ul>
        <form class="form-panel resource-add-doc" data-section-id="${section.id}">
          <label>Document title</label>
          <input name="title" required placeholder="May 2026 Schedule" />
          <label>Link (optional)</label>
          <input name="url" type="url" placeholder="https:// or file share link" />
          <label>Notes (optional)</label>
          <input name="notes" placeholder="Location, version, or where the file lives" />
          <button type="submit">Add document to ${escapeHtml(section.name)}</button>
        </form>
      </article>
    `;
  }

  function render() {
    const data = load();
    root.innerHTML = data.sections.map(renderSection).join("");
  }

  addSectionForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const nameInput = document.getElementById("sectionName");
    const descInput = document.getElementById("sectionDescription");
    const name = nameInput.value.trim();
    const description = descInput.value.trim();

    if (!name) return;

    const data = load();
    const exists = data.sections.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      alert("A section with that name already exists.");
      return;
    }

    data.sections.push({
      id: uid(),
      name,
      description,
      builtin: false,
      docs: [],
    });

    save(data);
    render();
    addSectionForm.reset();
    nameInput.focus();
  });

  root.addEventListener("submit", function (e) {
    const form = e.target.closest(".resource-add-doc");
    if (!form) return;
    e.preventDefault();

    const sectionId = form.dataset.sectionId;
    const title = form.elements.title.value.trim();
    const url = form.elements.url.value.trim();
    const notes = form.elements.notes.value.trim();

    if (!title) return;

    const data = load();
    const section = data.sections.find((s) => s.id === sectionId);
    if (!section) return;

    section.docs.push({
      id: uid(),
      title,
      url,
      notes,
      addedAt: new Date().toISOString(),
    });

    save(data);
    render();
  });

  root.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const data = load();
    const action = btn.dataset.action;

    if (action === "remove-doc") {
      const docId = btn.dataset.docId;
      const sectionEl = btn.closest(".resource-section");
      const sectionId = sectionEl?.dataset.sectionId;
      const section = data.sections.find((s) => s.id === sectionId);
      if (!section) return;
      if (!confirm("Remove this document from the section?")) return;
      section.docs = section.docs.filter((d) => d.id !== docId);
      save(data);
      render();
      return;
    }

    if (action === "remove-section") {
      const sectionId = btn.dataset.sectionId;
      const section = data.sections.find((s) => s.id === sectionId);
      if (!section || section.builtin) return;
      const msg =
        section.docs.length > 0
          ? `Remove "${section.name}" and its ${section.docs.length} document(s)?`
          : `Remove section "${section.name}"?`;
      if (!confirm(msg)) return;
      data.sections = data.sections.filter((s) => s.id !== sectionId);
      save(data);
      render();
    }
  });

  render();
})();
