(() => {
  "use strict";

  const config = window.CRENAUX_CONFIG || {};
  const app = document.getElementById("app");
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

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(`crenaux:${key}`);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(`crenaux:${key}`, JSON.stringify(value));
      } catch {}
    },
  };

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2200);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Lien copié");
    } catch {
      toast("Copie impossible, sélectionne le lien à la main");
    }
  }

  function renderMessage(title, body) {
    app.innerHTML = `
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(body)}</p>
      <p><a class="btn btn-secondary" href="./">Créer des créneaux</a></p>`;
  }

  function renderLoading() {
    app.innerHTML = `<p class="muted">Chargement…</p>`;
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

    app.innerHTML = `
      <h1>Créer des créneaux</h1>
      <p class="lead">Choisis une plage horaire, découpe-la en créneaux, puis partage le lien : chacun s'inscrit sur le créneau qui lui va.</p>

      <form id="create" class="form" novalidate>
        <label class="field">
          <span>Titre</span>
          <input name="title" maxlength="120" placeholder="Ex. Entretiens individuels" required>
        </label>

        <div class="row row-3">
          <label class="field">
            <span>Date</span>
            <input type="date" name="date" value="${todayIso()}" required>
          </label>
          <label class="field">
            <span>De</span>
            <input type="time" name="start" value="14:00" required>
          </label>
          <label class="field">
            <span>À</span>
            <input type="time" name="end" value="18:00" required>
          </label>
        </div>

        <div class="row row-2">
          <label class="field">
            <span>Nombre de créneaux</span>
            <input type="number" name="count" value="8" min="1" max="200" inputmode="numeric" required>
          </label>
          <label class="field">
            <span>Personnes par créneau</span>
            <input type="number" name="capacity" value="1" min="1" max="500" inputmode="numeric" required>
          </label>
        </div>

        <div class="preview" id="preview"></div>

        <p class="error" id="create-error" hidden></p>
        <button class="btn btn-primary" type="submit">Créer et obtenir le lien</button>
      </form>

      ${
        mine.length
          ? `<section class="section">
              <h2>Tes créneaux récents</h2>
              <ul class="list">
                ${mine
                  .map(
                    (m) => `<li class="list-row">
                      <a href="?a=${esc(m.admin_key)}">${esc(m.title)}</a>
                      <span class="muted">${esc(formatDate(m.date))}</span>
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
        preview.innerHTML = `<p class="muted">${esc(problem)}</p>`;
        return;
      }
      const total = toMinutes(v.end) - toMinutes(v.start);
      const slots = splitRange(v.start, v.end, v.count);
      const even = total % v.count === 0;
      const duration = even ? `de ${formatDuration(total / v.count)}` : `d'environ ${formatDuration(Math.round(total / v.count))}`;
      const shown = slots.slice(0, 24);
      preview.innerHTML = `
        <p class="preview-summary">
          ${plural(v.count, "créneau", "créneaux")} ${duration}
          · ${plural(v.capacity, "personne", "personnes")} par créneau
          · ${plural(v.count * v.capacity, "place", "places")} au total
        </p>
        <div class="chips">
          ${shown.map(([a, b]) => `<span class="chip">${a}–${b}</span>`).join("")}
          ${slots.length > shown.length ? `<span class="chip chip-more">+${slots.length - shown.length}</span>` : ""}
        </div>`;
    }

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
        return;
      }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Création…";
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
        btn.textContent = "Créer et obtenir le lien";
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

    function draw() {
      const free = event.slots.reduce((n, s) => n + Math.max(0, event.capacity - s.taken), 0);
      app.innerHTML = `
        <h1>${esc(event.title)}</h1>
        <p class="lead">${esc(formatDate(event.date))}</p>

        ${
          mine
            ? `<p class="notice">Tu es inscrit·e sur le créneau <strong>${esc(mine.starts)}–${esc(mine.ends)}</strong> (${esc(mine.name)}).</p>`
            : ""
        }

        <div class="section-head">
          <h2>Choisis un créneau</h2>
          <span class="muted">${free ? plural(free, "place libre", "places libres") : "Tout est complet"}</span>
        </div>

        <ul class="slots">
          ${event.slots
            .map((s) => {
              const left = event.capacity - s.taken;
              const full = left <= 0;
              const open = openSlot === s.id;
              return `<li class="slot${full ? " is-full" : ""}${open ? " is-open" : ""}">
                <div class="slot-line">
                  <span class="slot-time">${s.starts}–${s.ends}</span>
                  <span class="slot-meta">${full ? "Complet" : event.capacity === 1 ? "Libre" : plural(left, "place", "places")}</span>
                  ${
                    full || open
                      ? `<span class="slot-action"></span>`
                      : `<button class="btn btn-secondary btn-small slot-action" data-pick="${s.id}">Choisir</button>`
                  }
                </div>
                ${
                  open
                    ? `<form class="slot-form" id="signup" novalidate>
                        <label class="field">
                          <span>Prénom</span>
                          <input name="first" maxlength="60" autocomplete="given-name" required>
                        </label>
                        <label class="field">
                          <span>Nom</span>
                          <input name="last" maxlength="60" autocomplete="family-name" required>
                        </label>
                        <div class="slot-form-actions">
                          <button class="btn btn-primary" type="submit">S'inscrire</button>
                          <button class="btn btn-ghost" type="button" data-cancel>Annuler</button>
                        </div>
                        ${formError ? `<p class="error">${esc(formError)}</p>` : ""}
                      </form>`
                    : ""
                }
              </li>`;
            })
            .join("")}
        </ul>`;

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
      btn.textContent = "Inscription…";
      try {
        const slot = await rpc("sign_up", {
          p_public_id: publicId,
          p_slot_id: openSlot,
          p_first_name: first,
          p_last_name: last,
        });
        store.set(`signed:${publicId}`, { starts: slot.starts, ends: slot.ends, name: `${first} ${last}` });
        app.innerHTML = `
          <h1>C'est noté, ${esc(first)} !</h1>
          <p class="lead">Tu es inscrit·e à « ${esc(event.title)} », ${esc(formatDate(event.date).toLowerCase())}, de <strong>${esc(slot.starts)}</strong> à <strong>${esc(slot.ends)}</strong>.</p>
          <p><a class="btn btn-secondary" href="?e=${esc(publicId)}">Revenir aux créneaux</a></p>`;
      } catch (err) {
        const keep = { first: form.first.value, last: form.last.value };
        formError = errorText(err);
        if (err.message === "SLOT_FULL") {
          openSlot = null;
          await reload();
          draw();
          toast(formError);
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
      app.innerHTML = `
        <h1>${esc(data.title)}</h1>
        <p class="lead">${esc(formatDate(data.date))} · ${plural(data.slots.length, "créneau", "créneaux")} · ${plural(data.capacity, "personne", "personnes")} par créneau</p>

        ${isNew ? `<p class="notice">Tes créneaux sont prêts. Envoie le lien ci-dessous aux participants.</p>` : ""}

        <div class="links">
          <div class="link-row">
            <span class="link-label">Lien à partager</span>
            <input class="link-input" readonly value="${esc(shareUrl)}">
            <button class="btn btn-primary btn-small" data-copy="${esc(shareUrl)}">Copier</button>
          </div>
          <div class="link-row">
            <span class="link-label">Ton lien de gestion</span>
            <input class="link-input" readonly value="${esc(adminUrl)}">
            <button class="btn btn-secondary btn-small" data-copy="${esc(adminUrl)}">Copier</button>
          </div>
          <p class="hint">Garde le lien de gestion pour toi : c'est lui qui donne accès à la liste des inscrits.</p>
        </div>

        <div class="section-head">
          <h2>Inscrits</h2>
          <span class="muted">${people} / ${total} · <button class="link-btn" data-csv>Exporter en CSV</button></span>
        </div>

        <ul class="slots">
          ${data.slots
            .map(
              (s) => `<li class="slot slot-admin">
                <div class="slot-line">
                  <span class="slot-time">${s.starts}–${s.ends}</span>
                  <span class="slot-meta">${s.people.length} / ${data.capacity}</span>
                </div>
                ${
                  s.people.length
                    ? `<ul class="people">
                        ${s.people
                          .map(
                            (p) => `<li>
                              <span>${esc(p.first_name)} ${esc(p.last_name)}</span>
                              <button class="icon-btn" data-remove="${p.id}" data-name="${esc(p.first_name)} ${esc(p.last_name)}" title="Retirer" aria-label="Retirer ${esc(p.first_name)} ${esc(p.last_name)}">×</button>
                            </li>`
                          )
                          .join("")}
                      </ul>`
                    : `<p class="people-empty">Personne pour l'instant</p>`
                }
              </li>`
            )
            .join("")}
        </ul>`;
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

    function exportCsv() {
      const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const lines = [["Créneau", "Prénom", "Nom"].map(cell).join(";")];
      data.slots.forEach((s) =>
        s.people.forEach((p) => lines.push([`${s.starts}-${s.ends}`, p.first_name, p.last_name].map(cell).join(";")))
      );
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${data.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "creneaux"}-${data.date}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    app.onclick = async (e) => {
      const copyBtn = e.target.closest("[data-copy]");
      if (copyBtn) return copy(copyBtn.dataset.copy);
      if (e.target.closest("[data-csv]")) return exportCsv();
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
          toast(errorText(err));
        }
      }
    };
    app.addEventListener("focusin", (e) => {
      if (e.target.classList.contains("link-input")) e.target.select();
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
