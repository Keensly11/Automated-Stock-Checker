// Saves and loads the product list and settings in the browser (localStorage),
// so the data is still there after the page is reloaded.

const DataStore = {
  KEYS: {
    data: "stockChecker.data",
    settings: "stockChecker.settings",
  },

  // Reads and parses a saved value; returns null if missing or unreadable.
  read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  // Saves a value; returns false if the browser refused (e.g. private mode or too large).
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },

  // data = { fileName, loadedAt, sheetNames, products: [{ model, stock, stockText, price, currency, sheet }] }
  // Returns null when nothing has been loaded yet.
  loadData() {
    const data = this.read(this.KEYS.data);
    if (!data) return null;
    // A previous version could keep several files; keep the most recently loaded one.
    if (data.sources) {
      const newest = data.sources.slice().sort((a, b) => b.loadedAt.localeCompare(a.loadedAt))[0];
      return newest || null;
    }
    return data.products ? data : null;
  },

  saveData(data) {
    return this.write(this.KEYS.data, data);
  },

  // settings = { lowStockThreshold, savedMappings: { [headersKey]: mapping } }
  loadSettings() {
    const saved = this.read(this.KEYS.settings) || {};
    return Object.assign({ savedMappings: {} }, CONFIG.defaults, saved);
  },

  saveSettings(settings) {
    return this.write(this.KEYS.settings, settings);
  },
};
