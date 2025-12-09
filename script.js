const STORAGE_KEY = "soulCoresFantasticFour";
const CUSTOM_CREATURES_KEY = "soulCoresCustomCreatures";
const STATUS_TODO = "todo";
const STATUS_DONE = "done";
const EURO_SYMBOL = "\u20AC";
const numberFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});
const TAG_LABELS = {
  S: "Solo (S)",
  A: "Zusammen (A)",
};

const PLACEHOLDER_ICON =
  "data:image/gif;base64,R0lGODlhAQABAPAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

// Supabase Konfiguration (anon/public key verwenden, nicht den secret key!)
const SUPABASE_URL = "https://aumkfsovlfenrgfyqsmy.supabase.co";
const SUPABASE_KEY = "sb_publishable_Rf5cVZgQHUsHOFxA5zqfsQ_LF55bvff";
const supabaseClient = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const syncStatusEl = document.getElementById("sync-status");

function setSyncStatus(message, isError = false) {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = message || "";
  if (isError) {
    syncStatusEl.dataset.state = "error";
  } else {
    syncStatusEl.removeAttribute("data-state");
  }
}

let soulCores = [];

const form = document.getElementById("add-core-form");
const nameInput = document.getElementById("core-name");
const priceInput = document.getElementById("core-price");
const coreListContainer = document.getElementById("core-list-container");
const customCreatureForm = document.getElementById("custom-creature-form");
const customCreatureNameInput = document.getElementById("custom-creature-name");
const customCreatureIconInput = document.getElementById("custom-creature-icon");
const customCreatureFeedback = document.getElementById("custom-creature-feedback");
const csvOpenButton = document.getElementById("csv-open-button");
const csvCloseButton = document.getElementById("csv-close-button");
const csvLoadForm = document.getElementById("csv-load-form");
const csvFileInput = document.getElementById("csv-file-input");
const csvImportFeedback = document.getElementById("csv-import-feedback");
const csvPreview = document.getElementById("csv-preview");
const csvApplyButton = document.getElementById("csv-apply-button");
const importModal = document.getElementById("import-modal");
const importModalBackdrop = importModal?.querySelector(".modal-backdrop");
const completedListContainer = document.getElementById(
  "completed-list-container"
);
const completedToggle = document.getElementById("completed-toggle");
const completedSection = document.getElementById("completed-list");
const completedSearch = document.getElementById("completed-search");
let showCompletedDetails = true;
let completedSearchQuery = "";

const completedSummary = document.getElementById("completed-summary");
const completedTotalSum = document.getElementById("completed-total-sum");
const completedTotalUnit = document.getElementById("completed-total-unit");
const completedSoloSum = document.getElementById("completed-solo-sum");
const creatureGrid = document.getElementById("creature-grid");
const creatureSearch = document.getElementById("creature-search");
const coreSummary = document.getElementById("core-summary");
const coreTotalSum = document.getElementById("core-total-sum");
const coreTotalUnit = document.getElementById("core-total-unit");
const formFeedback = document.getElementById("form-feedback");

if (priceInput) {
  priceInput.dataset.rawValue = "";
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `core-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function stripSoulCoreSuffix(name) {
  return typeof name === "string"
    ? name.replace(/\s*Soul Core$/i, "").trim()
    : "";
}

const creatures = sortByName(
  Array.isArray(window.CREATURES) && window.CREATURES.length > 0
    ? window.CREATURES.map((creature) => {
        const strippedName = stripSoulCoreSuffix(creature.name);
        return {
          ...creature,
          name: strippedName,
          normalized: strippedName.toLowerCase(),
          icon: resolveIcon(creature.icon),
        };
      })
    : []
);

const customCreatures = loadCustomCreatures();
creatures.push(...customCreatures);

let filteredCreatures = creatures;
let selectedCreatureButton = null;
let parsedImports = [];

function formatThousands(value) {
  return numberFormatter.format(value);
}

function sanitizePrice(value) {
  return value.replace(/\D/g, "");
}

function resolveIcon(icon) {
  if (!icon) {
    return "";
  }
  if (icon.startsWith("data:")) {
    return icon;
  }
  // Use locally bundled icons when possible to avoid hotlink/CORS issues
  const localMatch = icon.match(/([A-Za-z0-9_%\-]+\.gif)/i);
  if (icon.startsWith("icons/")) {
    return icon;
  }
  if (localMatch && localMatch[1]) {
    return `icons/${localMatch[1]}`;
  }
  try {
    const url = new URL(icon);
    const hostPath = `${url.host}${url.pathname}${url.search}`;
    // Forward full host+path without encoding so query params stay intact
    return `https://images.weserv.nl/?url=ssl:${hostPath}`;
  } catch (error) {
    return icon;
  }
}

function mapRowToCore(row) {
  if (!row) return null;
  const price = Number(row.price);
  const unitPrice = Number.isFinite(row.unit_price)
    ? Number(row.unit_price)
    : Math.round(price / 5);
  return {
    id: row.id,
    name: row.name,
    price,
    unitPrice,
    icon: resolveIcon(row.icon || ""),
    status: row.status === STATUS_DONE ? STATUS_DONE : STATUS_TODO,
    tag: row.tag || null,
  };
}

function getIconSrc(icon) {
  const resolved = resolveIcon(icon);
  return resolved || PLACEHOLDER_ICON;
}

function parseCsv(text) {
  const rows = [];

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      let delimiter = null;
      if (line.includes(";")) {
        delimiter = ";";
      } else if (line.includes("\t")) {
        delimiter = "\t";
      } else if (line.includes(",")) {
        delimiter = ",";
      }

      const rawParts = (delimiter
        ? line.split(delimiter)
        : line.split(/\s+/)
      )
        .map((cell) => cell.trim())
        .filter((cell) => cell !== "");

      if (!rawParts.length) {
        return;
      }

      // Some CSV exports have a leading index column. If the first cell is numeric
      // and the second cell is text, shift the mapping.
      const looksLikeIndex = /^\d+$/.test(rawParts[0]);
      const hasSecond = rawParts.length > 1;
      const firstIsText = rawParts[0] && isNaN(Number(rawParts[0])) === true;

      let rawName;
      let rawPrice;
      let rawTag;

      if (looksLikeIndex && hasSecond) {
        rawName = rawParts[1] || "";
        rawPrice = rawParts[2] || "";
        rawTag = rawParts[3] || "";
      } else if (firstIsText && rawParts.length >= 2) {
        rawName = rawParts[0];
        rawPrice = rawParts[1];
        rawTag = rawParts[2] || "";
      } else {
        rawName = rawParts[0] || "";
        rawPrice = rawParts[1] || "";
        rawTag = rawParts[2] || "";
      }

      // Skip obvious headers
      if (
        (rawName || "").toLowerCase() === "name" ||
        (rawPrice || "").toLowerCase().startsWith("preis")
      ) {
        return;
      }

      const name = stripSoulCoreSuffix(rawName || "");
      const price = Number.parseInt(sanitizePrice(rawPrice || ""), 10);
      const tag = (rawTag || "").toUpperCase();

      rows.push({ name, price, tag });
    });

  return rows;
}

function renderCsvPreview(rows) {
  if (!csvPreview) {
    return;
  }

  if (!rows.length) {
    csvPreview.innerHTML = '<p class="empty-state">Keine Vorschau verfuegbar.</p>';
    return;
  }

  const items = rows
    .map(
      (row) => `
        <div class="csv-row">
          <div class="csv-name">${row.name || "(kein Name)"}</div>
          <div class="csv-price">${Number.isFinite(row.price) ? formatThousands(row.price) + " " + EURO_SYMBOL : "-"}</div>
          <div class="csv-tag">${row.tag || ""}</div>
        </div>
      `
    )
    .join("");

  csvPreview.innerHTML = items;
}

function loadCustomCreatures() {
  try {
    const stored = localStorage.getItem(CUSTOM_CREATURES_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry.name !== "string") {
          return null;
        }
        const strippedName = stripSoulCoreSuffix(entry.name);
        if (!strippedName) {
          return null;
        }
        return {
          name: strippedName,
          icon:
            typeof entry.icon === "string" && entry.icon.length > 0
              ? resolveIcon(entry.icon)
              : "",
          normalized: strippedName.toLowerCase(),
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("Konnte Custom-Creatures nicht laden:", error);
    return [];
  }
}

function persistCustomCreatures(list) {
  try {
    localStorage.setItem(CUSTOM_CREATURES_KEY, JSON.stringify(list));
  } catch (error) {
    console.error("Konnte Custom-Creatures nicht speichern:", error);
  }
}

function creatureNameExists(name) {
  const target = name.toLowerCase();
  return creatures.some((c) => c.name.toLowerCase() === target);
}

function showCustomCreatureFeedback(message, isError = true) {
  if (!customCreatureFeedback) {
    return;
  }
  customCreatureFeedback.textContent = message;
  customCreatureFeedback.dataset.state = isError ? "error" : "success";
}

function clearValidationState() {
  if (formFeedback) {
    formFeedback.textContent = "";
  }

  [priceInput, creatureSearch].forEach((input) => {
    input?.removeAttribute("aria-invalid");
  });
}

function showValidationError(message, field) {
  if (formFeedback) {
    formFeedback.textContent = message;
  }

  [priceInput, creatureSearch].forEach((input) => {
    if (input === field) {
      input?.setAttribute("aria-invalid", "true");
    } else {
      input?.removeAttribute("aria-invalid");
    }
  });

  if (field) {
    field.focus({ preventScroll: true });
  }
}

function showCsvFeedback(message, isError = true) {
  if (!csvImportFeedback) {
    return;
  }
  csvImportFeedback.textContent = message;
  csvImportFeedback.dataset.state = isError ? "error" : "success";
}

function openImportModal() {
  if (!importModal) return;
  importModal.hidden = false;
  parsedImports = [];
  renderCsvPreview([]);
  csvApplyButton?.setAttribute("disabled", "true");
  showCsvFeedback("");
}

function closeImportModal() {
  if (!importModal) return;
  importModal.hidden = true;
  parsedImports = [];
  renderCsvPreview([]);
  showCsvFeedback("");
  csvLoadForm?.reset();
}

function sortByName(items) {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, "de", { sensitivity: "base" })
  );
}

function isNameReserved(name) {
  const normalized = name.toLowerCase();
  return soulCores.some((core) => core.name.toLowerCase() === normalized);
}

function getTakenNamesSet() {
  return new Set(soulCores.map((core) => core.name.toLowerCase()));
}

function handlePriceInput(event) {
  if (!priceInput) {
    return;
  }

  const rawDigits = sanitizePrice(event.target.value);
  priceInput.dataset.rawValue = rawDigits;
  priceInput.value = rawDigits ? formatThousands(Number(rawDigits)) : "";
}

function hideSummary() {
  if (!coreSummary) {
    return;
  }

  coreSummary.hidden = true;

  if (coreTotalSum) {
    coreTotalSum.textContent = `0\u00A0${EURO_SYMBOL}`;
  }

  if (coreTotalUnit) {
    coreTotalUnit.textContent = `0\u00A0${EURO_SYMBOL}`;
  }
}

function updateSummaryTotals(totalPrice, totalUnit) {
  if (!coreSummary || !coreTotalSum || !coreTotalUnit) {
    return;
  }

  coreSummary.hidden = false;
  coreTotalSum.textContent = `${formatThousands(totalPrice)}\u00A0${EURO_SYMBOL}`;
  coreTotalUnit.textContent = `${formatThousands(totalUnit)}\u00A0${EURO_SYMBOL}`;
}

function hideCompletedSummary() {
  if (!completedSummary) {
    return;
  }

  completedSummary.hidden = true;

  if (completedTotalSum) {
    completedTotalSum.textContent = `0\u00A0${EURO_SYMBOL}`;
  }

  if (completedTotalUnit) {
    completedTotalUnit.textContent = `0\u00A0${EURO_SYMBOL}`;
  }

  if (completedSoloSum) {
    completedSoloSum.textContent = `0\u00A0${EURO_SYMBOL}`;
  }
}

function updateCompletedToggleUI() {
  if (completedToggle) {
    completedToggle.textContent = showCompletedDetails
      ? "Nur Icons"
      : "Details anzeigen";
    completedToggle.setAttribute(
      "aria-pressed",
      showCompletedDetails ? "true" : "false"
    );
  }

  if (completedSection) {
    completedSection.classList.toggle(
      "icons-only-mode",
      !showCompletedDetails
    );
  }

  if (completedListContainer) {
    completedListContainer.classList.toggle(
      "icons-only",
      !showCompletedDetails
    );
  }
}

updateCompletedToggleUI();

function updateCompletedSummary(totalPrice, totalUnit, soloPrice) {
  if (!completedSummary || !completedTotalSum || !completedTotalUnit || !completedSoloSum) {
    return;
  }

  completedSummary.hidden = false;
  completedTotalSum.textContent = `${formatThousands(totalPrice)}\u00A0${EURO_SYMBOL}`;
  completedTotalUnit.textContent = `${formatThousands(totalUnit)}\u00A0${EURO_SYMBOL}`;
  completedSoloSum.textContent = `${formatThousands(soloPrice)}\u00A0${EURO_SYMBOL}`;
}

function renderCreatureList(list = creatures) {
  if (!creatureGrid) {
    return;
  }

  const takenNames = getTakenNamesSet();
  const availableList = sortByName(
    list.filter((creature) => !takenNames.has(creature.name.toLowerCase()))
  );

  const activeName =
    selectedCreatureButton?.dataset?.name || nameInput?.value || null;
  selectedCreatureButton = null;

  if (!availableList.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-state";
    emptyMessage.textContent =
      "Keine Monster gefunden oder bereits zugeordnet.";
    creatureGrid.replaceChildren(emptyMessage);
    return;
  }

  const fragment = document.createDocumentFragment();

  availableList.forEach((creature) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "creature-card";
    button.dataset.name = creature.name;
    button.dataset.icon = creature.icon;

    const img = document.createElement("img");
    img.src = getIconSrc(creature.icon);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      img.src = PLACEHOLDER_ICON;
    };
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      img.src = PLACEHOLDER_ICON;
    };

    const label = document.createElement("span");
    label.className = "creature-name";
    label.textContent = creature.name;

    button.append(img, label);

    if (activeName && creature.name === activeName) {
      button.classList.add("is-selected");
      selectedCreatureButton = button;
    }

    fragment.appendChild(button);
  });

  creatureGrid.replaceChildren(fragment);
}

function renderTodoList() {
  if (!coreListContainer) {
    hideSummary();
    return;
  }

  const todoCores = sortByName(
    soulCores.filter((core) => core.status === STATUS_TODO)
  );

  if (!todoCores.length) {
    coreListContainer.innerHTML =
      '<p class="empty-state">Noch keine Soul cores eingetragen.</p>';
    hideSummary();
    return;
  }

  const totalPrice = todoCores.reduce((sum, core) => sum + core.price, 0);
  const totalUnit = todoCores.reduce((sum, core) => sum + core.unitPrice, 0);

  coreListContainer.innerHTML = todoCores
    .map(
      (core) => `
      <div class="core-list-item" data-id="${core.id}">
        <button
          type="button"
          class="core-remove"
          aria-label="Eintrag ${core.name} entfernen"
          data-id="${core.id}"
        >
          &times;
        </button>
        <div class="core-item-main">
          <img src="${getIconSrc(core.icon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.src='${PLACEHOLDER_ICON}'" />
          <div class="core-item-info">
            <span class="core-item-name">${core.name}</span>
          </div>
        </div>
        <div class="core-sidebar">
          <div class="core-sidebar-row">
            <div class="core-item-prices">
              <span class="core-price-line">Gesamt: ${formatThousands(
                core.price
              )} ${EURO_SYMBOL}</span>
              <span class="core-price-line">/5: ${formatThousands(
                core.unitPrice
              )} ${EURO_SYMBOL}</span>
            </div>
            <div class="core-actions">
              <button
                type="button"
                class="core-action core-action-s"
                data-action="S"
                data-id="${core.id}"
                aria-label="Aktion S - ${core.name}"
              >
                S
              </button>
              <button
                type="button"
                class="core-action core-action-a"
                data-action="A"
                data-id="${core.id}"
                aria-label="Aktion A - ${core.name}"
              >
                A
              </button>
            </div>
          </div>
        </div>
      </div>
    `
    )
    .join("");

  updateSummaryTotals(totalPrice, totalUnit);
}

function renderCompletedList() {
  if (!completedListContainer) {
    return;
  }

  updateCompletedToggleUI();

  let completed = sortByName(
    soulCores.filter((core) => core.status === STATUS_DONE)
  );

  // Filter by search query if one exists
  if (completedSearchQuery.trim()) {
    const query = completedSearchQuery.toLowerCase().trim();
    completed = completed.filter((core) =>
      core.name.toLowerCase().includes(query)
    );
  }

  if (!showCompletedDetails) {
    hideCompletedSummary();

    if (!completed.length) {
      const emptyMessage = completedSearchQuery.trim() 
        ? `Keine fertigen Soul cores gefunden für "${completedSearchQuery}".`
        : "Noch keine Soul cores abgeschlossen.";
      completedListContainer.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
      return;
    }

    completedListContainer.innerHTML = completed
      .map(
        (core) => `
      <div class="completed-icon-cell" title="${core.name}" data-name="${core.name}">
        <img src="${getIconSrc(core.icon)}" alt="${core.name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.src='${PLACEHOLDER_ICON}'" />
        <span class="completed-icon-label">${core.name}</span>
      </div>
    `
      )
      .join("");

    return;
  }

  if (!completed.length) {
    const emptyMessage = completedSearchQuery.trim() 
      ? `Keine fertigen Soul cores gefunden für "${completedSearchQuery}".`
      : "Noch keine Soul cores abgeschlossen.";
    completedListContainer.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    hideCompletedSummary();
    return;
  }

  const totalPrice = completed.reduce((sum, core) => sum + core.price, 0);
  const cooperativeTotalUnit = completed
    .filter((core) => core.tag === "A")
    .reduce((sum, core) => sum + core.unitPrice, 0);
  const soloCores = completed.filter((core) => core.tag === "S");
  const soloTotalPrice = soloCores.reduce((sum, core) => sum + core.price, 0);

  updateCompletedSummary(totalPrice, cooperativeTotalUnit, soloTotalPrice);

  completedListContainer.innerHTML = completed
    .map((core) => {
      const tag = core.tag && TAG_LABELS[core.tag] ? core.tag : null;
      const tagMarkup = tag
        ? `<div class="core-item-tags"><span class="core-tag" data-tag="${core.tag}">${TAG_LABELS[core.tag]}</span></div>`
        : "";

      return `
      <div class="core-list-item core-list-item--completed" data-id="${core.id}">
        <button
          type="button"
          class="core-remove"
          aria-label="Eintrag ${core.name} entfernen"
          data-id="${core.id}"
        >
          &times;
        </button>
        <div class="core-item-main">
          <img src="${getIconSrc(core.icon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.src='${PLACEHOLDER_ICON}'" />
          <div class="core-item-info">
            <span class="core-item-name">${core.name}</span>
          </div>
        </div>
        <div class="core-sidebar">
          ${tagMarkup}
          <div class="core-sidebar-row">
            <div class="core-item-prices">
              <span class="core-price-line">Gesamt: ${formatThousands(
                core.price
              )} ${EURO_SYMBOL}</span>
              <span class="core-price-line">/5: ${formatThousands(
                core.unitPrice
              )} ${EURO_SYMBOL}</span>
            </div>
            <div class="core-completed-actions">
              <button
                type="button"
                class="core-action core-action-s"
                data-action="S"
                data-id="${core.id}"
                aria-label="Aktion S - ${core.name}"
              >
                S
              </button>
              <button
                type="button"
                class="core-action core-action-a"
                data-action="A"
                data-id="${core.id}"
                aria-label="Aktion A - ${core.name}"
              >
                A
              </button>
              <button
                type="button"
                class="core-action core-action-return"
                data-action="RESTORE"
                data-id="${core.id}"
                aria-label="Zurueck nach To-do - ${core.name}"
              >
                &#8635;
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderAllViews() {
  renderTodoList();
  renderCompletedList();
  renderCreatureList(filteredCreatures);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(soulCores));
  } catch (error) {
    console.error("Konnte Soul cores nicht speichern:", error);
  }
}

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return;
    }

    const seen = new Set();
    const mapped = [];

    parsed.forEach((entry) => {
      if (!entry) {
        return;
      }

      const price = Number(entry.price);
      const baseName = stripSoulCoreSuffix(entry.name);
      if (!baseName || Number.isNaN(price)) {
        return;
      }

      const key = baseName.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);

      const unitPriceCandidate = Number(entry.unitPrice);
      const unitPrice = Number.isFinite(unitPriceCandidate)
        ? Math.round(unitPriceCandidate)
        : Math.round(price / 5);

      const fallbackCreature = creatures.find(
        (creature) => creature.name === baseName
      );

      const normalizedTag =
        typeof entry.tag === "string" && TAG_LABELS[entry.tag.toUpperCase()]
          ? entry.tag.toUpperCase()
          : null;

      const status =
        entry.status === STATUS_DONE ? STATUS_DONE : STATUS_TODO;

      mapped.push({
        id:
          typeof entry.id === "string" && entry.id.trim().length > 0
            ? entry.id
            : generateId(),
        name: baseName,
        price,
        unitPrice,
        icon:
          typeof entry.icon === "string" && entry.icon.length > 0
            ? entry.icon
            : fallbackCreature?.icon || "",
        status,
        tag: status === STATUS_DONE ? normalizedTag : null,
      });
    });

    soulCores = mapped;
  } catch (error) {
    console.error("Konnte gespeicherte Soul cores nicht laden:", error);
    soulCores = [];
  }
}

async function loadFromSupabase() {
  if (!supabaseClient) {
    setSyncStatus("Supabase nicht initialisiert.", true);
    return false;
  }

  try {
    setSyncStatus("Lade Daten aus Supabase...");
    const { data, error } = await supabaseClient
      .from("cores")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase fetch error", error);
      setSyncStatus("Supabase-Fehler beim Laden.", true);
      return false;
    }

    const mapped = Array.isArray(data)
      ? data.map(mapRowToCore).filter(Boolean)
      : [];

    soulCores = mapped;
    persist(); // lokaler Cache
    renderAllViews();
    setSyncStatus(`Synchronisiert (${mapped.length})`);
    return true;
  } catch (error) {
    console.error("Supabase fetch exception", error);
    setSyncStatus("Supabase-Fehler beim Laden.", true);
    return false;
  }
}

async function addCore(core) {
  if (!supabaseClient) {
    setSyncStatus("Supabase nicht initialisiert.", true);
    return;
  }

  setSyncStatus("Speichere...");
  const payload = {
    name: core.name,
    price: core.price,
    unit_price: core.unitPrice,
    icon: core.icon || "",
    status: core.status,
    tag: core.tag,
  };

  const { data, error } = await supabaseClient
    .from("cores")
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error", error);
    setSyncStatus("Speichern fehlgeschlagen.", true);
    return;
  }

  const mapped = mapRowToCore(data);
  if (mapped) {
    soulCores.push(mapped);
    persist();
    renderAllViews();
    setSyncStatus("Gespeichert");
  }
}

async function removeCore(id) {
  if (!supabaseClient) {
    setSyncStatus("Supabase nicht initialisiert.", true);
    return;
  }

  const { error } = await supabaseClient.from("cores").delete().eq("id", id);

  if (error) {
    console.error("Supabase delete error", error);
    setSyncStatus("Löschen fehlgeschlagen.", true);
    return;
  }

  const initialLength = soulCores.length;
  soulCores = soulCores.filter((core) => core.id !== id);
  if (soulCores.length !== initialLength) {
    persist();
    renderAllViews();
    setSyncStatus("Gelöscht");
  }
}

async function markCoreAsCompleted(id, tag) {
  const uppercaseTag = tag.toUpperCase();
  if (!TAG_LABELS[uppercaseTag]) {
    return;
  }

  const core = soulCores.find((item) => item.id === id);
  if (!core) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("cores")
    .update({ status: STATUS_DONE, tag: uppercaseTag })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Supabase update error", error);
    setSyncStatus("Update fehlgeschlagen.", true);
    return;
  }

  const mapped = mapRowToCore(data);
  if (mapped) {
    soulCores = soulCores.map((item) => (item.id === id ? mapped : item));
    persist();
    renderAllViews();
    setSyncStatus("Aktualisiert");
  }
}

async function updateCompletedTag(id, tag) {
  const uppercaseTag = tag.toUpperCase();
  if (!TAG_LABELS[uppercaseTag]) {
    return;
  }

  const core = soulCores.find((item) => item.id === id);
  if (!core) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("cores")
    .update({ status: STATUS_DONE, tag: uppercaseTag })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Supabase update error", error);
    setSyncStatus("Update fehlgeschlagen.", true);
    return;
  }

  const mapped = mapRowToCore(data);
  if (mapped) {
    soulCores = soulCores.map((item) => (item.id === id ? mapped : item));
    persist();
    renderCompletedList();
    setSyncStatus("Aktualisiert");
  }
}

async function restoreCore(id) {
  const core = soulCores.find((item) => item.id === id);
  if (!core) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("cores")
    .update({ status: STATUS_TODO, tag: null })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Supabase update error", error);
    setSyncStatus("Update fehlgeschlagen.", true);
    return;
  }

  const mapped = mapRowToCore(data);
  if (mapped) {
    soulCores = soulCores.map((item) => (item.id === id ? mapped : item));
    persist();
    renderAllViews();
    setSyncStatus("Zurückgesetzt");
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();

  clearValidationState();

  if (!priceInput) {
    return;
  }

  const rawValue =
    priceInput.dataset.rawValue || sanitizePrice(priceInput.value);
  const price = Number.parseInt(rawValue, 10);

  if (Number.isNaN(price) || price < 0) {
    showValidationError("Bitte einen gueltigen Preis eingeben.", priceInput);
    return;
  }

  let name = stripSoulCoreSuffix(nameInput?.value.trim() ?? "");
  let icon = selectedCreatureButton?.dataset.icon || "";

  if (!name && creatureSearch) {
    const searchValue = stripSoulCoreSuffix(creatureSearch.value.trim());
    if (searchValue) {
      const match = creatures.find(
        (creature) => creature.name.toLowerCase() === searchValue.toLowerCase()
      );
      if (match) {
        name = match.name;
        icon = match.icon;
      }
    }
  }

  if (!name) {
    showValidationError("Bitte ein Monster auswaehlen.", creatureSearch);
    return;
  }

  if (isNameReserved(name)) {
    showValidationError(
      `Soul core ${name} ist bereits erfasst.`,
      creatureSearch
    );
    return;
  }

  if (!icon) {
    const match = creatures.find(
      (creature) => creature.name.toLowerCase() === name.toLowerCase()
    );
    icon = match ? match.icon : "";
  }

  const unitPrice = Math.round(price / 5);

  await addCore({
    name,
    price,
    unitPrice,
    icon: resolveIcon(icon),
    status: STATUS_TODO,
    tag: null,
  });

  if (selectedCreatureButton) {
    selectedCreatureButton.classList.remove("is-selected");
    selectedCreatureButton = null;
  }

  form?.reset();
  priceInput.dataset.rawValue = "";
  if (nameInput) {
    nameInput.value = "";
  }
  if (creatureSearch) {
    creatureSearch.value = "";
  }
  clearValidationState();
  filteredCreatures = creatures;
  renderCreatureList(filteredCreatures);
  creatureSearch?.focus();
}

function handleCustomCreatureSubmit(event) {
  event.preventDefault();

  showCustomCreatureFeedback("");

  const rawName = stripSoulCoreSuffix(
    customCreatureNameInput?.value.trim() ?? ""
  );
  const rawIcon = customCreatureIconInput?.value.trim() ?? "";

  if (!rawName) {
    showCustomCreatureFeedback("Bitte einen Namen eingeben.");
    customCreatureNameInput?.focus();
    return;
  }

  if (creatureNameExists(rawName)) {
    showCustomCreatureFeedback("Dieses Monster existiert bereits.");
    customCreatureNameInput?.focus();
    return;
  }

  const customEntry = {
    name: rawName,
    icon: resolveIcon(rawIcon),
    normalized: rawName.toLowerCase(),
  };

  customCreatures.push(customEntry);
  persistCustomCreatures(customCreatures);
  creatures.push(customEntry);

  filteredCreatures = creatures;
  renderCreatureList(filteredCreatures);

  showCustomCreatureFeedback("Monster gespeichert.", false);
  customCreatureForm?.reset();
  customCreatureNameInput?.focus();
}

async function handleCoreListClick(event) {
  const removeButton = event.target.closest("button.core-remove");
  if (removeButton) {
    const { id } = removeButton.dataset;
    if (id) {
      await removeCore(id);
    }
    return;
  }

  const actionButton = event.target.closest("button.core-action");
  if (!actionButton) {
    return;
  }

  const { action, id } = actionButton.dataset;
  if (!id) {
    return;
  }

  if (action === "S" || action === "A") {
    await markCoreAsCompleted(id, action);
  }
}

async function handleCompletedListClick(event) {
  const removeButton = event.target.closest("button.core-remove");
  if (removeButton) {
    const { id } = removeButton.dataset;
    if (id) {
      await removeCore(id);
    }
    return;
  }

  const actionButton = event.target.closest("button.core-action");
  if (!actionButton) {
    return;
  }

  const { action, id } = actionButton.dataset;
  if (!id) {
    return;
  }

  if (action === "RESTORE") {
    await restoreCore(id);
    return;
  }

  if (action === "S" || action === "A") {
    await updateCompletedTag(id, action);
  }
}

function handleCsvLoad(event) {
  event.preventDefault();

  showCsvFeedback("");

  const file = csvFileInput?.files?.[0];
  if (!file) {
    showCsvFeedback("Bitte eine CSV-Datei waehlen.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const rows = parseCsv(text);

    if (!rows.length) {
      showCsvFeedback("Keine gueltigen Zeilen gefunden.");
      parsedImports = [];
      renderCsvPreview([]);
      csvApplyButton?.setAttribute("disabled", "true");
      return;
    }

    parsedImports = rows.filter(
      (row) => row.name && !Number.isNaN(row.price) && row.price > 0
    );

    if (!parsedImports.length) {
      showCsvFeedback("Alle Zeilen ungueltig (Name/Preis fehlt).");
      renderCsvPreview([]);
      csvApplyButton?.setAttribute("disabled", "true");
      return;
    }

    renderCsvPreview(parsedImports.slice(0, 200));
    csvApplyButton?.removeAttribute("disabled");
    const skipped = rows.length - parsedImports.length;
    showCsvFeedback(
      `Vorschau: ${parsedImports.length} Zeilen geladen${
        skipped > 0 ? ", " + skipped + " verworfen" : ""
      }`,
      false
    );
  };

  reader.onerror = () => {
    showCsvFeedback("Datei konnte nicht gelesen werden.");
  };

  reader.readAsText(file);
}

async function handleCsvApply() {
  if (!parsedImports.length) {
    showCsvFeedback("Keine geladenen Zeilen zum Uebernehmen.");
    return;
  }

  let duplicates = 0;
  let invalid = 0;

  const payload = [];

  parsedImports.forEach((row) => {
    const { name, price, tag } = row;

    if (!name || Number.isNaN(price) || price <= 0) {
      invalid += 1;
      return;
    }

    if (isNameReserved(name)) {
      duplicates += 1;
      return;
    }

    const unitPrice = Math.round(price / 5);
    const normalizedTag = TAG_LABELS[tag] ? tag : null;
    const match = creatures.find(
      (creature) => creature.name.toLowerCase() === name.toLowerCase()
    );

    payload.push({
      name,
      price,
      unit_price: unitPrice,
      icon: resolveIcon(match?.icon || ""),
      status: STATUS_DONE,
      tag: normalizedTag,
    });
  });

  if (!payload.length) {
    showCsvFeedback("Keine gueltigen neuen Zeilen.");
    return;
  }

  setSyncStatus("Import wird gespeichert...");
  const { data, error } = await supabaseClient
    .from("cores")
    .insert(payload)
    .select();

  if (error) {
    console.error("Supabase CSV insert error", error);
    showCsvFeedback("Speichern fehlgeschlagen.", true);
    setSyncStatus("Speichern fehlgeschlagen.", true);
    return;
  }

  const mapped = Array.isArray(data)
    ? data.map(mapRowToCore).filter(Boolean)
    : [];
  soulCores.push(...mapped);
  persist();
  renderAllViews();

  const added = mapped.length;
  const message = `Uebernommen: ${added} hinzugefuegt, ${duplicates} Duplikate, ${invalid} verworfen.`;
  showCsvFeedback(message, added === 0);
  setSyncStatus("Import gespeichert");

  parsedImports = [];
  renderCsvPreview([]);
  csvApplyButton?.setAttribute("disabled", "true");
}

function handleCreatureClick(event) {
  const button = event.target.closest("button.creature-card");
  if (!button) {
    return;
  }

  selectCreature(button, { focusPrice: true });
}

function selectCreature(button, options = {}) {
  if (!button) {
    return;
  }

  const strippedName = stripSoulCoreSuffix(button.dataset.name || "");

  if (selectedCreatureButton) {
    selectedCreatureButton.classList.remove("is-selected");
  }

  button.classList.add("is-selected");
  selectedCreatureButton = button;

  if (nameInput) {
    nameInput.value = strippedName;
  }

  if (creatureSearch) {
    creatureSearch.value = strippedName;
  }

  if (options.focusPrice) {
    priceInput?.focus();
  } else if (options.focusButton) {
    button.focus();
  }
}

function handleCreatureGridKeydown(event) {
  const navigableKeys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Enter", " "];
  if (!navigableKeys.includes(event.key)) {
    return;
  }

  const buttons = Array.from(creatureGrid?.querySelectorAll("button.creature-card") || []);
  if (!buttons.length) {
    return;
  }

  const columns = 2;
  let currentIndex = buttons.indexOf(document.activeElement);
  if (currentIndex === -1 && selectedCreatureButton) {
    currentIndex = buttons.indexOf(selectedCreatureButton);
  }
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  let targetIndex = currentIndex;

  switch (event.key) {
    case "ArrowRight":
      targetIndex = Math.min(currentIndex + 1, buttons.length - 1);
      event.preventDefault();
      break;
    case "ArrowLeft":
      targetIndex = Math.max(currentIndex - 1, 0);
      event.preventDefault();
      break;
    case "ArrowDown":
      targetIndex = Math.min(currentIndex + columns, buttons.length - 1);
      event.preventDefault();
      break;
    case "ArrowUp":
      targetIndex = Math.max(currentIndex - columns, 0);
      event.preventDefault();
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      selectCreature(buttons[currentIndex], { focusPrice: true });
      return;
    default:
      return;
  }

  const target = buttons[targetIndex];
  if (target) {
    selectCreature(target, { focusButton: true });
  }
}

function handleFormKeydown(event) {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (form?.requestSubmit) {
      form.requestSubmit();
    } else {
      form?.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }
}

function handleCreatureSearch(event) {
  const query = event.target.value.toLowerCase().trim();
  if (!query) {
    filteredCreatures = creatures;
    renderCreatureList(filteredCreatures);
    return;
  }

  filteredCreatures = sortByName(
    creatures.filter((creature) =>
      creature.normalized.includes(query)
    )
  );

  renderCreatureList(filteredCreatures);
}

function handleCompletedSearch(event) {
  completedSearchQuery = event.target.value;
  renderCompletedList();
}

async function bootstrap() {
  const ok = await loadFromSupabase();
  if (!ok) {
    loadFromStorage();
    renderAllViews();
    setSyncStatus("Offline-Daten genutzt.", true);
  }
}

bootstrap();

if (form) {
  form.addEventListener("submit", handleFormSubmit);
}

if (coreListContainer) {
  coreListContainer.addEventListener("click", handleCoreListClick);
}

if (completedListContainer) {
  completedListContainer.addEventListener("click", handleCompletedListClick);
}

if (completedToggle) {
  completedToggle.addEventListener("click", () => {
    showCompletedDetails = !showCompletedDetails;
    updateCompletedToggleUI();
    renderCompletedList();
  });
}

if (priceInput) {
  priceInput.addEventListener("input", handlePriceInput);
}

if (creatureGrid) {
  creatureGrid.addEventListener("click", handleCreatureClick);
}

if (creatureSearch) {
  creatureSearch.addEventListener("input", handleCreatureSearch);
}

if (completedSearch) {
  completedSearch.addEventListener("input", handleCompletedSearch);
}

if (customCreatureForm) {
  customCreatureForm.addEventListener("submit", handleCustomCreatureSubmit);
}
if (csvOpenButton) {
  csvOpenButton.addEventListener("click", openImportModal);
}
if (csvCloseButton) {
  csvCloseButton.addEventListener("click", closeImportModal);
}
if (csvLoadForm) {
  csvLoadForm.addEventListener("submit", handleCsvLoad);
}
if (csvApplyButton) {
  csvApplyButton.addEventListener("click", handleCsvApply);
}
if (importModalBackdrop) {
  importModalBackdrop.addEventListener("click", closeImportModal);
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && importModal && !importModal.hidden) {
    closeImportModal();
  }
});
if (creatureGrid) {
  creatureGrid.addEventListener("keydown", handleCreatureGridKeydown);
}
if (form) {
  form.addEventListener("keydown", handleFormKeydown);
}








