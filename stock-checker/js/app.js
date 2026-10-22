// Connects the page to the other scripts: loading the master file, searching, and settings.

const elements = {
  fileInput: document.getElementById("file-input"),
  fileInfo: document.getElementById("file-info"),
  fileStatus: document.getElementById("file-status"),
  emptyState: document.getElementById("empty-state"),
  searchArea: document.getElementById("search-area"),
  filterChips: document.querySelectorAll(".chip[data-filter]"),
  sortSelect: document.getElementById("sort-select"),
  resultCount: document.getElementById("result-count"),
  loadNotice: document.getElementById("load-notice"),
  loadError: document.getElementById("load-error"),
  mappingPanel: document.getElementById("mapping-panel"),
  headerRowSelect: document.getElementById("map-header-row"),
  mappingSelects: {
    model: document.getElementById("map-model"),
    stock: document.getElementById("map-stock"),
    price: document.getElementById("map-price"),
  },
  mappingSave: document.getElementById("map-save"),
  mappingSkip: document.getElementById("map-skip"),
  searchInput: document.getElementById("search-input"),
  results: document.getElementById("results"),
  thresholdInput: document.getElementById("setting-threshold"),
};

const state = {
  data: DataStore.loadData(), // the loaded master file: { fileName, loadedAt, sheetNames, products }
  settings: DataStore.loadSettings(),
  job: null, // the file being read now: { fileName, sheets, index, products, sheetNames, skipped }
  filter: "all",  // availability filter: "all" | "in" | "low" | "out"
  sort: "match",  // "match" | "price-asc" | "price-desc" | "stock-desc"
};

// ---------- Loading the master file ----------
// The file is read sheet by sheet. Sheets whose columns are recognised are read straight away;
// for the others the column panel opens, and the file finishes once the user saves or skips.

async function handleFile(file) {
  if (!file) return;
  elements.mappingPanel.hidden = true; // a new file replaces any half-finished one
  state.job = null;
  showMessages("", "");
  try {
    const workbook = await Loader.readWorkbook(file);
    state.job = {
      fileName: file.name,
      sheets: Loader.analyzeWorkbook(workbook, state.settings.savedMappings),
      index: 0,
      products: [],
      sheetNames: [],
      skipped: [],
    };
    continueJob();
  } catch (error) {
    showMessages(error.message, "");
  }
}

// Works through the file's sheets until one needs the user, or the file is done.
function continueJob() {
  const job = state.job;
  while (job.index < job.sheets.length) {
    const sheet = job.sheets[job.index];
    if (sheet.status === "ready") {
      takeSheet(sheet, sheet.headerIndex, sheet.mapping);
    } else if (sheet.status === "ask") {
      askAboutSheet(sheet);
      return; // saveColumnChoice() or skipSheet() continues from here
    } else {
      job.skipped.push(sheet.status === "hidden" ? `${sheet.name} (hidden)` : sheet.name);
    }
    job.index++;
  }
  finishJob();
}

function takeSheet(sheet, headerIndex, mapping) {
  const products = Loader.toProducts(sheet, headerIndex, mapping);
  if (products.length) {
    state.job.products.push(...products);
    state.job.sheetNames.push(sheet.name);
  } else {
    state.job.skipped.push(`${sheet.name} (no products)`);
  }
}

function finishJob() {
  const job = state.job;
  state.job = null;
  if (!job.products.length) {
    showMessages("No products found. Check that the file has Model, Stock and Price columns.", "");
    return;
  }

  state.data = {
    fileName: job.fileName,
    loadedAt: new Date().toISOString(),
    sheetNames: job.sheetNames,
    products: job.products,
  };
  const saved = DataStore.saveData(state.data);
  showMessages(
    saved ? "" : "Loaded, but the browser couldn't save it. You'll need to reload the file next time.",
    job.skipped.length ? `Skipped sheets: ${job.skipped.join(", ")}.` : "",
  );
  render();
}

function showMessages(error, notice) {
  UI.showError(elements.loadError, error);
  UI.showError(elements.loadNotice, notice);
}

// ---------- Picking columns by hand ----------

function currentSheet() {
  return state.job.sheets[state.job.index];
}

function askAboutSheet(sheet) {
  const multipleSheets = state.job.sheets.length > 1;
  const title = multipleSheets ? `${state.job.fileName} › ${sheet.name}` : state.job.fileName;
  UI.fillHeaderRowSelect(elements.headerRowSelect, sheet.rows, sheet.headerIndex);
  UI.fillColumnSelects(elements.mappingSelects, sheet.rows[sheet.headerIndex], sheet.mapping);
  elements.mappingSkip.hidden = !multipleSheets;
  UI.showMapping(elements.mappingPanel, title);
}

// When the user picks a different heading row, re-detect the columns from that row.
function changeHeaderRow() {
  const row = currentSheet().rows[Number(elements.headerRowSelect.value)];
  UI.fillColumnSelects(elements.mappingSelects, row, Loader.detectColumns(row));
}

function saveColumnChoice() {
  const mapping = {};
  for (const [field, select] of Object.entries(elements.mappingSelects)) {
    mapping[field] = Number(select.value);
  }
  const chosen = Object.values(mapping);
  if (!Loader.isComplete(mapping) || new Set(chosen).size !== chosen.length) {
    UI.showError(elements.loadError, "Pick a different column for each of Model, Stock and Price.");
    return;
  }

  const sheet = currentSheet();
  const headerIndex = Number(elements.headerRowSelect.value);
  state.settings.savedMappings[Loader.headerKey(sheet.rows[headerIndex])] = mapping;
  DataStore.saveSettings(state.settings);
  takeSheet(sheet, headerIndex, mapping);
  moveToNextSheet();
}

function skipSheet() {
  state.job.skipped.push(currentSheet().name);
  moveToNextSheet();
}

function moveToNextSheet() {
  elements.mappingPanel.hidden = true;
  UI.showError(elements.loadError, "");
  state.job.index++;
  continueJob();
}

// ---------- Showing data and searching ----------

function products() {
  return state.data ? state.data.products : [];
}

// Redraws everything that depends on the loaded file.
// Before a file is loaded only the "Load your master file" box shows;
// after, the top bar shows the file and the search area takes over.
function render() {
  const hasData = products().length > 0;
  elements.emptyState.hidden = hasData;
  elements.searchArea.hidden = !hasData;
  elements.fileInfo.hidden = !hasData;
  UI.renderFileStatus(elements.fileStatus, state.data);
  updateFilterCounts();
  refresh();
}

function statusOf(product) {
  return UI.availability(product, state.settings.lowStockThreshold).key;
}

function updateFilterCounts() {
  const counts = { all: products().length, in: 0, low: 0, out: 0 };
  for (const product of products()) {
    const key = statusOf(product);
    if (key in counts) counts[key]++;
  }
  UI.renderFilterCounts(elements.filterChips, counts);
  UI.markActiveChip(elements.filterChips, state.filter);
}

// Applies the availability filter and the chosen sort order.
// Prices that aren't set always go to the end when sorting by price.
function filterAndSort(list) {
  const filtered = state.filter === "all" ? list : list.filter((p) => statusOf(p) === state.filter);
  const byPrice = (direction) => (a, b) => {
    if (a.price === null) return b.price === null ? 0 : 1;
    if (b.price === null) return -1;
    return (a.price - b.price) * direction;
  };
  const sorters = {
    "price-asc": byPrice(1),
    "price-desc": byPrice(-1),
    "stock-desc": (a, b) => (b.stock ?? -1) - (a.stock ?? -1),
  };
  const sorter = sorters[state.sort];
  return sorter ? filtered.slice().sort(sorter) : filtered;
}

function refresh() {
  const all = products();
  if (!all.length) {
    UI.clear(elements.results);
    elements.resultCount.textContent = "";
    return;
  }

  const query = elements.searchInput.value.trim();
  const filterLabel = UI.STATUSES[state.filter];

  // Nothing typed and no filter: wait for a search.
  if (!query && state.filter === "all") {
    UI.clear(elements.results);
    elements.resultCount.textContent = "Type a model name, or pick a filter to browse.";
    return;
  }

  // With text, search first; with only a filter, browse the whole file.
  const matches = query ? Search.find(all, query) : all;
  if (query && !matches.length) {
    elements.resultCount.textContent = "";
    UI.renderNotFound(elements.results, query, Search.suggest(all, query, CONFIG.maxSuggestions), pickSuggestion);
    return;
  }

  const shown = filterAndSort(matches);
  if (!shown.length) {
    elements.resultCount.textContent = "";
    UI.renderMessage(elements.results, `None of the matches for "${query}" are ${filterLabel.toLowerCase()}.`,
      [{ label: `Show all ${matches.length} match${matches.length === 1 ? "" : "es"}`, onClick: () => setFilter("all") }]);
    return;
  }

  const filterText = filterLabel ? ` · ${filterLabel}` : "";
  elements.resultCount.textContent = `${shown.length} result${shown.length === 1 ? "" : "s"}${filterText}`;
  // Show the sheet name on each result when the file has more than one sheet.
  const showSheet = (state.data.sheetNames || []).length > 1;
  UI.renderResults(elements.results, shown, state.settings, showSheet);
}

function pickSuggestion(model) {
  elements.searchInput.value = model;
  refresh();
}

// Clicking the active chip again goes back to "All".
function setFilter(filter) {
  state.filter = filter === state.filter ? "all" : filter;
  UI.markActiveChip(elements.filterChips, state.filter);
  refresh();
}

// ---------- Settings ----------

function loadSettingsIntoForm() {
  elements.thresholdInput.value = state.settings.lowStockThreshold;
}

function saveSettingsFromForm() {
  const threshold = Number(elements.thresholdInput.value);
  state.settings.lowStockThreshold = Number.isFinite(threshold) && threshold >= 0
    ? threshold
    : CONFIG.defaults.lowStockThreshold;
  DataStore.saveSettings(state.settings);
  updateFilterCounts(); // low-stock counts depend on the threshold
  refresh();
}

// ---------- Wiring up events ----------

elements.fileInput.addEventListener("change", () => {
  handleFile(elements.fileInput.files[0]);
  elements.fileInput.value = ""; // lets the same file be loaded again later
});

// A file can be dropped anywhere on the page.
document.addEventListener("dragover", (event) => {
  event.preventDefault();
  document.body.classList.add("dragging");
});
document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) document.body.classList.remove("dragging"); // left the window
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  document.body.classList.remove("dragging");
  handleFile(event.dataTransfer.files[0]);
});

for (const chip of elements.filterChips) {
  chip.addEventListener("click", () => setFilter(chip.dataset.filter));
}
elements.sortSelect.addEventListener("change", () => {
  state.sort = elements.sortSelect.value;
  refresh();
});

// The Settings pop-over closes when clicking anywhere else.
const settingsMenu = document.querySelector(".settings-menu");
document.addEventListener("click", (event) => {
  if (settingsMenu.open && !settingsMenu.contains(event.target)) settingsMenu.open = false;
});

// Keyboard: "/" jumps to the search box, Escape clears it.
document.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);
  if (event.key === "/" && !typing && !elements.searchArea.hidden) {
    event.preventDefault();
    elements.searchInput.focus();
  }
});
elements.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    elements.searchInput.value = "";
    refresh();
  }
});

elements.headerRowSelect.addEventListener("change", changeHeaderRow);
elements.mappingSave.addEventListener("click", saveColumnChoice);
elements.mappingSkip.addEventListener("click", skipSheet);
elements.searchInput.addEventListener("input", refresh);
elements.thresholdInput.addEventListener("change", saveSettingsFromForm);

// ---------- Start ----------

loadSettingsIntoForm();
render();
if (products().length) elements.searchInput.focus();
