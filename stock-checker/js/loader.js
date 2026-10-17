// Reads an Excel or CSV file, works out which sheets hold stock lists and where their
// headings are, finds the model/stock/price columns, and turns rows into a clean product list.

const Loader = {
  HEADER_SEARCH_ROWS: 20, // how far down each sheet to look for the heading row

  // Reads the file into a SheetJS workbook.
  readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Couldn't read the file."));
      reader.onload = () => {
        try {
          resolve(XLSX.read(reader.result, { type: "array" }));
        } catch (e) {
          reject(new Error("This doesn't look like a valid Excel or CSV file."));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  },

  // Looks at every sheet and returns one entry per sheet:
  //   { name, rows, texts, headerIndex, mapping, status }
  // rows hold the cell values; texts hold the same cells as Excel displays them
  // (e.g. "AED 2,450.00"), which is where a price's currency shows up.
  // status is "ready" (columns known), "ask" (user must pick columns),
  // "other" (doesn't look like a stock list) or "hidden".
  analyzeWorkbook(workbook, savedMappings) {
    const hiddenFlags = (workbook.Workbook && workbook.Workbook.Sheets) || [];
    const sheets = [];

    workbook.SheetNames.forEach((name, i) => {
      const sheet = workbook.Sheets[name];
      const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const allTexts = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      const keep = allRows.map((row) => row.some((cell) => String(cell).trim() !== ""));
      const rows = allRows.filter((_, index) => keep[index]);
      const texts = allTexts.filter((_, index) => keep[index]);
      if (rows.length < 2) return; // empty sheet: nothing to do

      if (hiddenFlags[i] && hiddenFlags[i].Hidden) {
        sheets.push({ name, rows, texts, status: "hidden" });
        return;
      }

      const saved = this.findSavedHeaderRow(rows, savedMappings);
      if (saved) {
        sheets.push({ name, rows, texts, ...saved, status: "ready" });
        return;
      }

      // Two of the three columns recognised means it's probably a stock list worth asking about;
      // one loose match (e.g. a notes sheet mentioning "prices") isn't enough.
      const best = this.findHeaderRow(rows);
      let status = "other";
      if (this.isComplete(best.mapping)) status = "ready";
      else if (best.score >= 2) status = "ask";
      sheets.push({ name, rows, texts, headerIndex: best.index, mapping: best.mapping, status });
    });

    // If nothing looked like a stock list, ask about the first sheet rather than give up.
    const usable = sheets.some((s) => s.status === "ready" || s.status === "ask");
    const firstOther = sheets.find((s) => s.status === "other");
    if (!usable && firstOther) firstOther.status = "ask";

    return sheets;
  },

  // The text that identifies a heading row, used to remember column choices.
  headerKey(row) {
    return row.map((cell) => String(cell).trim()).join("|");
  },

  // If one of the top rows matches headings the user has mapped before, reuse that choice.
  findSavedHeaderRow(rows, savedMappings) {
    const limit = Math.min(this.HEADER_SEARCH_ROWS, rows.length);
    for (let index = 0; index < limit; index++) {
      const mapping = savedMappings[this.headerKey(rows[index])];
      if (mapping) return { headerIndex: index, mapping };
    }
    return null;
  },

  // Finds the heading row: the row near the top that matches the most of Model/Stock/Price.
  // This skips title rows like "Price List – October" above the real headings.
  findHeaderRow(rows) {
    let best = { index: 0, mapping: this.detectColumns(rows[0]), score: -1 };
    const limit = Math.min(this.HEADER_SEARCH_ROWS, rows.length - 1);
    for (let index = 0; index < limit; index++) {
      const mapping = this.detectColumns(rows[index]);
      const score = Object.values(mapping).filter((col) => col !== -1).length;
      if (score > best.score) best = { index, mapping, score };
    }
    return best;
  },

  // "Model Name" -> "modelname", so header matching ignores case, spaces and symbols.
  normalizeHeader(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
  },

  // Returns { model, stock, price } as column indexes, or -1 where no column matched.
  // Exact header matches win; then a header that contains a known name (e.g. "Current Stock").
  detectColumns(headers) {
    const normalized = headers.map((h) => this.normalizeHeader(h));
    const mapping = { model: -1, stock: -1, price: -1 };
    const used = new Set();

    const findColumn = (synonyms, exact) => {
      for (const name of synonyms.map((s) => this.normalizeHeader(s))) {
        const index = normalized.findIndex((h, i) =>
          h !== "" && !used.has(i) && (exact ? h === name : h.includes(name)));
        if (index !== -1) return index;
      }
      return -1;
    };

    for (const exact of [true, false]) {
      for (const field of Object.keys(mapping)) {
        if (mapping[field] !== -1) continue;
        const index = findColumn(CONFIG.columns[field], exact);
        if (index !== -1) {
          mapping[field] = index;
          used.add(index);
        }
      }
    }
    return mapping;
  },

  isComplete(mapping) {
    return mapping.model !== -1 && mapping.stock !== -1 && mapping.price !== -1;
  },

  // Turns "₹1,299.00" or " 12 " into a number; returns null for blanks or text.
  parseNumber(value) {
    if (typeof value === "number") return value;
    const cleaned = String(value).replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  },

  // Stock can be a count ("12") or words ("Available"). Returns { stock, stockText }:
  // a number with no text, or null with the original words.
  parseStock(value) {
    const text = String(value ?? "").trim();
    if (text === "") return { stock: 0, stockText: "" };
    const isNumber = typeof value === "number" || /^[\d,.\s]+$/.test(text);
    if (isNumber) return { stock: this.parseNumber(value) ?? 0, stockText: "" };
    return { stock: null, stockText: text };
  },

  // A row to leave out: a section title like "LAPTOPS" (no price and no stock),
  // or the heading row repeated further down the sheet.
  isSkippableRow(row, mapping, modelHeading) {
    const model = String(row[mapping.model] ?? "").trim();
    if (model === "") return true;
    if (this.normalizeHeader(model) === modelHeading) return true;
    const stockBlank = String(row[mapping.stock] ?? "").trim() === "";
    const priceMissing = this.parseNumber(row[mapping.price]) === null;
    return stockBlank && priceMissing;
  },

  // ---------- Currency ----------
  // The currency comes from the file itself, in this order:
  //   1. the price cell as Excel shows it ("AED 2,450.00", "₹1,299", "2,450 Dhs")
  //   2. the currency used by most other prices on the same sheet
  //   3. the price column's heading ("Unit Price (AED)", "MRP Rs")
  // If none of these mention one, the price is shown as a plain number.

  // "AED 2,450.00" -> "AED", "₹1,299" -> "₹", "2,450" -> "".
  currencyFromCell(text) {
    const value = String(text ?? "").trim();
    if (!/\d/.test(value)) return "";
    const leftover = value.replace(/[\d.,\s\-+()]/g, "");
    return leftover.length >= 1 && leftover.length <= 5 ? leftover : "";
  },

  // "Unit Price (AED)" -> "AED". Only recognised currency symbols and codes count,
  // so headings like "Price (incl VAT)" aren't mistaken for a currency.
  currencyFromHeading(text) {
    const codes = CONFIG.currencyCodes.join("|");
    const match = String(text ?? "").match(new RegExp(`[$€£₹¥]|\\b(${codes})\\b`, "i"));
    return match ? match[0] : "";
  },

  mostCommon(values) {
    const counts = {};
    for (const value of values) counts[value] = (counts[value] || 0) + 1;
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "";
  },

  // Builds [{ model, stock, stockText, price, currency, sheet }] from the rows below the heading row.
  toProducts(sheet, headerIndex, mapping) {
    const { rows, texts } = sheet;
    const modelHeading = this.normalizeHeader(rows[headerIndex][mapping.model] ?? "");
    const priceText = (index) => (texts[index] || [])[mapping.price];

    const productRows = [];
    for (let index = headerIndex + 1; index < rows.length; index++) {
      if (!this.isSkippableRow(rows[index], mapping, modelHeading)) productRows.push(index);
    }

    const cellCurrencies = productRows.map((index) => this.currencyFromCell(priceText(index))).filter(Boolean);
    const sheetCurrency = this.mostCommon(cellCurrencies)
      || this.currencyFromHeading(texts[headerIndex][mapping.price]);

    return productRows.map((index) => {
      const row = rows[index];
      return {
        model: String(row[mapping.model]).trim(),
        ...this.parseStock(row[mapping.stock]),
        price: this.parseNumber(row[mapping.price]),
        currency: this.currencyFromCell(priceText(index)) || sheetCurrency,
        sheet: sheet.name,
      };
    });
  },
};
