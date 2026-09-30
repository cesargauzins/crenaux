(() => {
  "use strict";

  const config = window.CRENEAUX_CONFIG || {};
  const app = document.getElementById("app");
  const hero = document.getElementById("hero");
  const params = new URLSearchParams(location.search);
  const baseUrl = location.origin + location.pathname;

  const ERRORS = {
    SLOT_FULL: "Ce créneau vient d'être complété. Choisis-en un autre.",
    ALREADY_REGISTERED: "Une personne avec ce prénom et ce nom est déjà inscrite.",
    INVALID_NAME: "Indique ton prénom et ton nom.",
    INVALID_RANGE: "L'heure de fin doit être après l'heure de début.",
    INVALID_SLOT_COUNT: "Trop de créneaux pour cette plage horaire.",
    INVALID_CAPACITY: "Le nombre de personnes doit être entre 1 et 500.",
    INVALID_TITLE: "Donne un titre.",
    NOT_FOUND: "Introuvable. Le lien est peut-être incorrect.",
    NETWORK: "Connexion impossible. Réessaie dans un instant.",
    NOT_CONFIGURED: "Le site n'est pas encore relié à sa base de données (js/config.js).",
  };

  const ICONS = {
    calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
    users: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/></svg>`,
    download: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>`,
    x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>`,
  };

  const EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";

  const loadedScripts = {};
  function loadScript(src) {
    loadedScripts[src] ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => {
        delete loadedScripts[src];
        reject(new Error("NETWORK"));
      };
      document.head.appendChild(s);
    });
    return loadedScripts[src];
  }

  const buildWorkbook = (d) => window.CreneauxExport.build(window.ExcelJS, d, formatDate(d.date));

  // ---------- API ----------

  async function rpc(fn, args) {
    if (!config.supabaseUrl || !config.supabaseKey) throw new Error("NOT_CONFIGURED");
    const headers = { "Content-Type": "application/json", apikey: config.supabaseKey };
    // Les anciennes clés « anon » sont des JWT ; les nouvelles clés publishable non.
    if (config.supabaseKey.startsWith("eyJ")) headers.Authorization = `Bearer ${config.supabaseKey}`;
    let res;
    try {
      res = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
      });
    } catch {
      throw new Error("NETWORK");
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.message) || "NETWORK");
    return data;
  }

  const errorText = (err) => ERRORS[err.message] || "Une erreur est survenue.";

  // ---------- Utilitaires ----------

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const formatDate = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  const formatDuration = (min) => {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  };

  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const initials = (p) => `${p.first_name.charAt(0)}${p.last_name.charAt(0)}`.toUpperCase();

  const meter = (value, max) =>
    `<span class="meter" aria-hidden="true"><span style="width:${max ? Math.min(100, (value / max) * 100) : 0}%"></span></span>`;

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(`creneaux:${key}`);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(`creneaux:${key}`, JSON.stringify(value));
      } catch {}
    },
  };

  let toastTimer;
  function toast(msg, ok = true) {
    const el = document.getElementById("toast");
    el.innerHTML = `${ok ? ICONS.check : ""}<span>${esc(msg)}</span>`;
    el.classList.toggle("is-error", !ok);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2400);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Lien copié");
    } catch {
      toast("Copie impossible, sélectionne le lien à la main", false);
    }
  }

  // Bandeau vert : titre, sous-titre et éléments optionnels.
  function setHero({ eyebrow = "", title, meta = [], extra = "" }) {
    hero.innerHTML = `
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}
      <h1>${esc(title)}</h1>
      ${meta.length ? `<ul class="hero-meta">${meta.map(([icon, text]) => `<li>${ICONS[icon]}${esc(text)}</li>`).join("")}</ul>` : ""}
      ${extra}`;
  }

  function renderMessage(title, body) {
    setHero({ title });
    app.innerHTML = `
      <section class="panel panel-message">
        <p>${esc(body)}</p>
        <a class="btn btn-primary" href="./">Créer des créneaux ${ICONS.arrow}</a>
      </section>`;
  }

  function renderLoading() {
    hero.innerHTML = `<div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div>`;
    app.innerHTML = `<section class="panel"><p class="muted">Chargement…</p></section>`;
  }

  // Même découpage que create_event côté SQL.
  function splitRange(start, end, count) {
    const total = toMinutes(end) - toMinutes(start);
    const s = toMinutes(start);
    return Array.from({ length: count }, (_, i) => [
      toHHMM(s + Math.round((i * total) / count)),
      toHHMM(s + Math.round(((i + 1) * total) / count)),
    ]);
  }

  // ---------- Création ----------

  function renderCreate() {
    document.title = "Créneaux";
    const mine = store.get("mine", []);

    setHero({
      eyebrow: "Planification en 30 secondes",
      title: "Crée tes créneaux, partage un lien.",
      extra: `<p class="hero-lead">Choisis une plage horaire, découpe-la, envoie le lien : chacun s'inscrit sur le créneau qui lui va.</p>`,
    });

    const stepper = (name, value, min, max) => `
      <div class="stepper">
        <button type="button" class="stepper-btn" data-step="-1" data-for="${name}" aria-label="Moins">−</button>
        <input type="number" name="${name}" value="${value}" min="${min}" max="${max}" inputmode="numeric" aria-labelledby="${name}-label" required>
        <button type="button" class="stepper-btn" data-step="1" data-for="${name}" aria-label="Plus">+</button>
      </div>`;

    app.innerHTML = `
      <section class="panel">
        <form id="create" class="form" novalidate>
          <label class="field">
            <span class="label">Titre</span>
            <input name="title" class="input-lg" maxlength="120" placeholder="Ex. Entretiens individuels" required>
          </label>

          <div class="row row-3">
            <label class="field">
              <span class="label">Date</span>
              <input type="date" name="date" value="${todayIso()}" required>
            </label>
            <label class="field">
              <span class="label">De</span>
              <input type="time" name="start" value="14:00" required>
            </label>
            <label class="field">
              <span class="label">À</span>
              <input type="time" name="end" value="18:00" required>
            </label>
          </div>

          <div class="row row-2">
            <div class="field">
              <span class="label" id="count-label">Nombre de créneaux</span>
              ${stepper("count", 8, 1, 200)}
            </div>
            <div class="field">
              <span class="label" id="capacity-label">Personnes par créneau</span>
              ${stepper("capacity", 1, 1, 500)}
            </div>
          </div>

          <div class="preview" id="preview"></div>

          <p class="error" id="create-error" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">Créer et obtenir le lien ${ICONS.arrow}</button>
        </form>
      </section>

      ${
        mine.length
          ? `<section class="panel">
              <h2 class="panel-title">Tes créneaux récents</h2>
              <ul class="recent">
                ${mine
                  .map(
                    (m) => `<li>
                      <a class="recent-row" href="?a=${esc(m.admin_key)}">
                        <span class="recent-title">${esc(m.title)}</span>
                        <span class="recent-date">${esc(formatDate(m.date))}</span>
                        ${ICONS.arrow}
                      </a>
                    </li>`
                  )
                  .join("")}
              </ul>
            </section>`
          : ""
      }`;

    const form = document.getElementById("create");
    const preview = document.getElementById("preview");
    const errorEl = document.getElementById("create-error");

    function readForm() {
      const f = new FormData(form);
      return {
        title: String(f.get("title") || "").trim(),
        date: f.get("date"),
        start: f.get("start"),
        end: f.get("end"),
        count: parseInt(f.get("count"), 10),
        capacity: parseInt(f.get("capacity"), 10),
      };
    }

    function validate(v) {
      if (!v.date || !v.start || !v.end) return "Renseigne la date et les horaires.";
      const total = toMinutes(v.end) - toMinutes(v.start);
      if (total <= 0) return ERRORS.INVALID_RANGE;
      if (!(v.count >= 1) || v.count > 200) return "Le nombre de créneaux doit être entre 1 et 200.";
      if (v.count > total) return ERRORS.INVALID_SLOT_COUNT;
      if (!(v.capacity >= 1) || v.capacity > 500) return ERRORS.INVALID_CAPACITY;
      return null;
    }

    function updatePreview() {
      const v = readForm();
      const problem = validate(v);
      if (problem) {
        preview.innerHTML = `<p class="preview-problem">${esc(problem)}</p>`;
        return;
      }
      const total = toMinutes(v.end) - toMinutes(v.start);
      const slots = splitRange(v.start, v.end, v.count);
      const even = total % v.count === 0;
      const duration = formatDuration(Math.round(total / v.count));
      const shown = slots.slice(0, 24);
      preview.innerHTML = `
        <div class="figures">
          <div class="figure"><strong>${v.count}</strong><span>${v.count > 1 ? "créneaux" : "créneau"}</span></div>
          <div class="figure"><strong>${even ? "" : "≈ "}${duration}</strong><span>par créneau</span></div>
          <div class="figure"><strong>${v.count * v.capacity}</strong><span>${v.count * v.capacity > 1 ? "places au total" : "place au total"}</span></div>
        </div>
        <div class="chips">
          ${shown.map(([a, b]) => `<span class="chip">${a} – ${b}</span>`).join("")}
          ${slots.length > shown.length ? `<span class="chip chip-more">+${slots.length - shown.length}</span>` : ""}
        </div>`;
    }

    form.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-step]");
      if (!btn) return;
      const input = form.elements[btn.dataset.for];
      const next = (parseInt(input.value, 10) || 0) + Number(btn.dataset.step);
      input.value = Math.min(Number(input.max), Math.max(Number(input.min), next));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    form.addEventListener("input", () => {
      errorEl.hidden = true;
      updatePreview();
    });
    updatePreview();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = readForm();
      const problem = !v.title ? ERRORS.INVALID_TITLE : validate(v);
      if (problem) {
        errorEl.textContent = problem;
        errorEl.hidden = false;
        if (!v.title) form.title.focus();
        return;
      }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Création…`;
      try {
        const res = await rpc("create_event", {
          p_title: v.title,
          p_date: v.date,
          p_start: v.start,
          p_end: v.end,
          p_slot_count: v.count,
          p_capacity: v.capacity,
        });
        const list = store.get("mine", []).filter((m) => m.admin_key !== res.admin_key);
        list.unshift({ title: v.title, date: v.date, admin_key: res.admin_key });
        store.set("mine", list.slice(0, 20));
        location.href = `?a=${encodeURIComponent(res.admin_key)}&new=1`;
      } catch (err) {
        errorEl.textContent = errorText(err);
        errorEl.hidden = false;
        btn.disabled = false;
        btn.innerHTML = `Créer et obtenir le lien ${ICONS.arrow}`;
      }
    });
  }

  // ---------- Participant ----------

  async function renderEvent(publicId) {
    renderLoading();
    let event;
    try {
      event = await rpc("get_event", { p_public_id: publicId });
    } catch (err) {
      return renderMessage("Oups", errorText(err));
    }
    if (!event) return renderMessage("Lien introuvable", "Ces créneaux n'existent pas ou le lien est incomplet.");

    document.title = `${event.title} · Créneaux`;
    let openSlot = null;
    let formError = "";
    const mine = store.get(`signed:${publicId}`, null);

    function drawHero() {
      const free = event.slots.reduce((n, s) => n + Math.max(0, event.capacity - s.taken), 0);
      setHero({
        eyebrow: "Inscription",
        title: event.title,
        meta: [
          ["calendar", formatDate(event.date)],
          ["users", free ? plural(free, "place libre", "places libres") : "Tout est complet"],
        ],
        extra: mine
          ? `<p class="hero-badge">${ICONS.check}Tu es inscrit·e sur <strong>${esc(mine.starts)} – ${esc(mine.ends)}</strong> (${esc(mine.name)})</p>`
          : "",
      });
    }

    function badge(left) {
      if (left <= 0) return `<span class="badge badge-full">Complet</span>`;
      if (event.capacity === 1) return `<span class="badge">Libre</span>`;
      if (left === 1) return `<span class="badge badge-last">Dernière place</span>`;
      return `<span class="badge">${plural(left, "place", "places")}</span>`;
    }

    function draw() {
      drawHero();
      app.innerHTML = `
        <section class="panel panel-flush">
          <h2 class="panel-title">Choisis ton créneau</h2>
          <ul class="slots">
            ${event.slots
              .map((s) => {
                const left = event.capacity - s.taken;
                const full = left <= 0;
                const open = openSlot === s.id;
                return `<li class="slot${full ? " is-full" : ""}${open ? " is-open" : ""}">
                  <div class="slot-line">
                    <div class="slot-when">
                      <span class="slot-time">${s.starts} <span class="slot-sep">–</span> ${s.ends}</span>
                      ${event.capacity > 1 ? meter(s.taken, event.capacity) : ""}
                    </div>
                    ${badge(left)}
                    ${
                      full
                        ? `<span class="slot-action"></span>`
                        : open
                        ? `<button class="btn btn-ghost btn-sm slot-action" data-cancel>Annuler</button>`
                        : `<button class="btn btn-choose btn-sm slot-action" data-pick="${s.id}">Choisir</button>`
                    }
                  </div>
                  ${
                    open
                      ? `<form class="slot-form" id="signup" novalidate>
                          <label class="field">
                            <span class="label">Prénom</span>
                            <input name="first" maxlength="60" autocomplete="given-name" required>
                          </label>
                          <label class="field">
                            <span class="label">Nom</span>
                            <input name="last" maxlength="60" autocomplete="family-name" required>
                          </label>
                          <button class="btn btn-primary" type="submit">Confirmer ${ICONS.check}</button>
                          ${formError ? `<p class="error">${esc(formError)}</p>` : ""}
                        </form>`
                      : ""
                  }
                </li>`;
              })
              .join("")}
          </ul>
        </section>`;

      const signup = document.getElementById("signup");
      if (signup) {
        signup.querySelector("input").focus();
        signup.addEventListener("submit", onSubmit);
      }
    }

    async function reload() {
      try {
        const fresh = await rpc("get_event", { p_public_id: publicId });
        if (fresh) event = fresh;
      } catch {}
    }

    async function onSubmit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const first = form.first.value.trim();
      const last = form.last.value.trim();
      if (!first || !last) {
        formError = ERRORS.INVALID_NAME;
        const keep = { first: form.first.value, last: form.last.value };
        draw();
        restore(keep);
        return;
      }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Inscription…`;
      try {
        const slot = await rpc("sign_up", {
          p_public_id: publicId,
          p_slot_id: openSlot,
          p_first_name: first,
          p_last_name: last,
        });
        store.set(`signed:${publicId}`, { starts: slot.starts, ends: slot.ends, name: `${first} ${last}` });
        setHero({ eyebrow: "Inscription confirmée", title: `C'est noté, ${first} !` });
        app.innerHTML = `
          <section class="panel panel-done">
            <div class="done-icon">${ICONS.check}</div>
            <p class="done-label">${esc(event.title)}</p>
            <p class="done-time">${esc(slot.starts)} – ${esc(slot.ends)}</p>
            <p class="done-date">${esc(formatDate(event.date))}</p>
            <a class="btn btn-secondary" href="?e=${esc(publicId)}">Revenir aux créneaux</a>
          </section>`;
      } catch (err) {
        const keep = { first: form.first.value, last: form.last.value };
        formError = errorText(err);
        if (err.message === "SLOT_FULL") {
          openSlot = null;
          await reload();
          draw();
          toast(formError, false);
          formError = "";
          return;
        }
        draw();
        restore(keep);
      }
    }

    function restore({ first, last }) {
      const form = document.getElementById("signup");
      if (!form) return;
      form.first.value = first;
      form.last.value = last;
    }

    app.onclick = (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) {
        openSlot = Number(pick.dataset.pick);
        formError = "";
        draw();
        return;
      }
      if (e.target.closest("[data-cancel]")) {
        openSlot = null;
        formError = "";
        draw();
      }
    };

    draw();
  }

  // ---------- Gestion ----------

  async function renderAdmin(adminKey, isNew) {
    renderLoading();
    let data;
    try {
      data = await rpc("get_admin", { p_admin_key: adminKey });
    } catch (err) {
      return renderMessage("Oups", errorText(err));
    }
    if (!data) return renderMessage("Lien introuvable", "Ce lien de gestion ne correspond à aucun créneau.");

    // Garde une trace locale pour retrouver ses créneaux depuis l'accueil.
    const mine = store.get("mine", []);
    if (!mine.some((m) => m.admin_key === adminKey)) {
      mine.unshift({ title: data.title, date: data.date, admin_key: adminKey });
      store.set("mine", mine.slice(0, 20));
    }
    if (isNew) history.replaceState(null, "", `?a=${encodeURIComponent(adminKey)}`);

    document.title = `${data.title} · Gestion · Créneaux`;
    const shareUrl = `${baseUrl}?e=${data.public_id}`;
    const adminUrl = `${baseUrl}?a=${adminKey}`;

    function draw() {
      const people = data.slots.reduce((n, s) => n + s.people.length, 0);
      const total = data.slots.length * data.capacity;
      setHero({
        eyebrow: isNew ? "Créneaux prêts · envoie le lien" : "Gestion",
        title: data.title,
        meta: [
          ["calendar", formatDate(data.date)],
          ["clock", plural(data.slots.length, "créneau", "créneaux")],
          ["users", `${plural(data.capacity, "personne", "personnes")} par créneau`],
        ],
        extra: `
          <div class="hero-progress">
            <div class="hero-progress-text"><strong>${people}</strong> / ${plural(total, "place prise", "places prises")}</div>
            ${meter(people, total)}
          </div>`,
      });

      app.innerHTML = `
        <section class="panel">
          <div class="share">
            <span class="label">Lien à partager</span>
            <div class="share-field">
              <input class="share-input" readonly value="${esc(shareUrl)}">
              <button class="btn btn-primary" data-copy="${esc(shareUrl)}">${ICONS.copy} Copier</button>
            </div>
          </div>
          <div class="share share-private">
            <span class="label">${ICONS.lock} Ton lien de gestion, à garder pour toi</span>
            <div class="share-field">
              <input class="share-input" readonly value="${esc(adminUrl)}">
              <button class="btn btn-secondary" data-copy="${esc(adminUrl)}">${ICONS.copy} Copier</button>
            </div>
          </div>
        </section>

        <section class="panel panel-flush">
          <div class="panel-head">
            <h2 class="panel-title">Inscrits</h2>
            <button class="btn btn-ghost btn-sm" data-xlsx>${ICONS.download} Exporter Excel</button>
          </div>
          <ul class="slots">
            ${data.slots
              .map(
                (s) => `<li class="slot slot-admin${s.people.length >= data.capacity ? " is-complete" : ""}">
                  <div class="slot-line">
                    <div class="slot-when">
                      <span class="slot-time">${s.starts} <span class="slot-sep">–</span> ${s.ends}</span>
                      ${meter(s.people.length, data.capacity)}
                    </div>
                    <span class="count">${s.people.length}<span>/${data.capacity}</span></span>
                  </div>
                  ${
                    s.people.length
                      ? `<ul class="people">
                          ${s.people
                            .map(
                              (p) => `<li class="person">
                                <span class="avatar">${esc(initials(p))}</span>
                                <span class="person-name">${esc(p.first_name)} ${esc(p.last_name)}</span>
                                <button class="icon-btn" data-remove="${p.id}" data-name="${esc(p.first_name)} ${esc(p.last_name)}" title="Retirer" aria-label="Retirer ${esc(p.first_name)} ${esc(p.last_name)}">${ICONS.x}</button>
                              </li>`
                            )
                            .join("")}
                        </ul>`
                      : `<p class="people-empty">Personne pour l'instant</p>`
                  }
                </li>`
              )
              .join("")}
          </ul>
        </section>`;
    }

    async function refresh() {
      try {
        const fresh = await rpc("get_admin", { p_admin_key: adminKey });
        if (fresh && JSON.stringify(fresh) !== JSON.stringify(data)) {
          data = fresh;
          draw();
        }
      } catch {}
    }

    async function exportXlsx(btn) {
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner spinner-dark"></span> Préparation…`;
      try {
        await loadScript(EXCELJS_URL);
        const blob = await buildWorkbook(data);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${data.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "creneaux"}-${data.date}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch {
        toast("Export impossible, réessaie dans un instant", false);
      } finally {
        btn.disabled = false;
        btn.innerHTML = label;
      }
    }

    app.onclick = async (e) => {
      const copyBtn = e.target.closest("[data-copy]");
      if (copyBtn) return copy(copyBtn.dataset.copy);
      const xlsxBtn = e.target.closest("[data-xlsx]");
      if (xlsxBtn) return exportXlsx(xlsxBtn);
      const rm = e.target.closest("[data-remove]");
      if (rm) {
        if (!confirm(`Retirer ${rm.dataset.name} de ce créneau ?`)) return;
        rm.disabled = true;
        try {
          await rpc("delete_signup", { p_admin_key: adminKey, p_signup_id: Number(rm.dataset.remove) });
          await refresh();
          toast("Inscription retirée");
        } catch (err) {
          rm.disabled = false;
          toast(errorText(err), false);
        }
      }
    };
    app.addEventListener("focusin", (e) => {
      if (e.target.classList.contains("share-input")) e.target.select();
    });

    draw();
    // Les inscriptions arrivent pendant que la page est ouverte.
    setInterval(() => document.visibilityState === "visible" && refresh(), 15000);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
  }

  // ---------- Routage ----------

  if (params.get("a")) renderAdmin(params.get("a"), params.has("new"));
  else if (params.get("e")) renderEvent(params.get("e"));
  else renderCreate();
})();
