// Connects the page to the other scripts: loading the master file, searching, and settings.

const elements = {
  fileInput: document.getElementById("file-input"),
  dropZone: document.getElementById("drop-zone"),
  fileStatus: document.getElementById("file-status"),
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
  summary: document.getElementById("summary"),
  results: document.getElementById("results"),
  thresholdInput: document.getElementById("setting-threshold"),
};

const state = {
  data: DataStore.loadData(), // the loaded master file: { fileName, loadedAt, sheetNames, products }
  settings: DataStore.loadSettings(),
  job: null, // the file being read now: { fileName, sheets, index, products, sheetNames, skipped }
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
function render() {
  UI.renderFileStatus(elements.fileStatus, state.data);
  elements.searchInput.disabled = !products().length;
  refresh();
}

function refresh() {
  UI.renderSummary(elements.summary, products(), state.settings);

  const query = elements.searchInput.value.trim();
  if (!query || !products().length) {
    UI.clear(elements.results);
    return;
  }
  const matches = Search.find(products(), query);
  if (matches.length) {
    // Show the sheet name on each result when the file has more than one sheet.
    const showSheet = (state.data.sheetNames || []).length > 1;
    UI.renderResults(elements.results, matches, state.settings, showSheet);
  } else {
    const suggestions = Search.suggest(products(), query, CONFIG.maxSuggestions);
    UI.renderNotFound(elements.results, query, suggestions, pickSuggestion);
  }
}

function pickSuggestion(model) {
  elements.searchInput.value = model;
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
  refresh();
}

// ---------- Wiring up events ----------

elements.fileInput.addEventListener("change", () => {
  handleFile(elements.fileInput.files[0]);
  elements.fileInput.value = ""; // lets the same file be loaded again later
});

elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("dragging");
});
elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.classList.remove("dragging");
});
elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("dragging");
  handleFile(event.dataTransfer.files[0]);
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
