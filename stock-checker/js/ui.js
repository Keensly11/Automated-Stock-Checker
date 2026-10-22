// Everything that draws on the page: result cards, badges, summary, messages.
// Text is always set with textContent so spreadsheet values can't inject HTML.

const UI = {
  // Labels for each availability status; key is also used by the filter chips.
  STATUSES: {
    in: "In stock",
    low: "Low stock",
    out: "Out of stock",
  },

  // Works out a product's availability, from its stock count or its stock words.
  // Returns { key: "in" | "low" | "out" | "other", label }.
  availability(product, threshold) {
    if (product.stock === null) return this.availabilityFromText(product.stockText);
    if (product.stock <= 0) return this.status("out");
    if (product.stock <= threshold) return this.status("low");
    return this.status("in");
  },

  status(key) {
    return { key, label: this.STATUSES[key] };
  },

  // "Available" -> In stock, "Sold out" -> Out of stock, using CONFIG.availabilityWords.
  // Words that don't match any list are shown as they are, with a neutral badge.
  availabilityFromText(text) {
    const lower = String(text).toLowerCase().trim();
    const words = CONFIG.availabilityWords;
    const matches = (list) => list.some((word) =>
      word.length <= 3 ? lower === word : lower.includes(word));
    if (matches(words.out)) return this.status("out");
    if (matches(words.low)) return this.status("low");
    if (matches(words.in)) return this.status("in");
    return { key: "other", label: text };
  },

  // "24 units in stock" for counts; the file's own words (e.g. "Available") otherwise.
  stockElement(product) {
    const wrapper = this.el("span", "card-stock");
    if (product.stock === null) {
      wrapper.textContent = product.stockText;
    } else {
      wrapper.append(this.el("strong", "", String(product.stock)),
        ` unit${product.stock === 1 ? "" : "s"} in stock`);
    }
    return wrapper;
  },

  // Shows the price in the currency the file uses: "AED 2,450", "₹1,29,900", or just "2,450".
  formatPrice(price, currency) {
    if (price === null || price === undefined) return "Price not set";
    const symbol = currency || "";
    const indian = /₹|^rs\.?$|^inr$/i.test(symbol); // Indian prices group as 1,00,000
    const decimals = Number.isInteger(price) ? 0 : 2; // 2450 -> "2,450", 1999.5 -> "1,999.50"
    const amount = price.toLocaleString(indian ? "en-IN" : "en-US",
      { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (!symbol) return amount;
    return /[a-z]/i.test(symbol) ? `${symbol} ${amount}` : `${symbol}${amount}`;
  },

  // Small helper: creates an element with a class and text.
  el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  },

  // One card per product:
  //   model name ............ availability badge
  //   sheet name (when the file has several)
  //   - - - - - - - - - - - - - - - - - - - - -
  //   PRICE (large) ......... 24 units in stock
  // A colored stripe on the left repeats the availability at a glance.
  createCard(product, settings, showSheet) {
    const status = this.availability(product, settings.lowStockThreshold);
    const card = this.el("article", `card status-${status.key}`);

    const title = this.el("div");
    title.append(this.el("h3", "card-model", product.model));
    if (showSheet && product.sheet) title.append(this.el("div", "card-sheet", `Sheet: ${product.sheet}`));
    const head = this.el("div", "card-head");
    head.append(title, this.el("span", `badge badge-${status.key}`, status.label));

    const hasPrice = product.price !== null && product.price !== undefined;
    const price = this.el("span", hasPrice ? "card-price" : "card-price no-price",
      this.formatPrice(product.price, product.currency));
    const foot = this.el("div", "card-foot");
    foot.append(price, this.stockElement(product));

    card.append(head, foot);
    return card;
  },

  renderResults(container, products, settings, showSheet) {
    container.replaceChildren();
    const shown = products.slice(0, CONFIG.maxResults);
    for (const product of shown) container.append(this.createCard(product, settings, showSheet));
    if (products.length > shown.length) {
      container.append(this.el("p", "more-results",
        `Showing the first ${shown.length} of ${products.length}. Type more to narrow it down.`));
    }
  },

  // A centered message in the results area, with optional buttons: [{ label, onClick }].
  renderMessage(container, text, buttons = [], hint = "") {
    container.replaceChildren();
    const box = this.el("div", "message-box");
    box.append(this.el("p", "", text));
    if (hint) box.append(this.el("p", "muted", hint));
    for (const { label, onClick } of buttons) {
      const button = this.el("button", "suggestion", label);
      button.addEventListener("click", onClick);
      box.append(button);
    }
    container.append(box);
  },

  // "No match" box with clickable suggestions; onPick(model) runs when one is clicked.
  renderNotFound(container, query, suggestions, onPick) {
    const buttons = suggestions.map((product) => ({
      label: product.model,
      onClick: () => onPick(product.model),
    }));
    this.renderMessage(container, `No model found for "${query}".`, buttons,
      suggestions.length ? "Did you mean:" : "Check the spelling or try part of the model name.");
  },

  clear(container) {
    container.replaceChildren();
  },

  // Puts the number of products in each availability group on the filter chips.
  renderFilterCounts(chips, counts) {
    for (const chip of chips) {
      chip.querySelector(".chip-count").textContent = counts[chip.dataset.filter] ?? 0;
    }
  },

  markActiveChip(chips, filter) {
    for (const chip of chips) {
      const active = chip.dataset.filter === filter;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
    }
  },

  // Compact file line in the top bar: "Stock list.xlsx · 3 sheets · loaded 22 Oct, 10:42".
  renderFileStatus(element, data) {
    if (!data) {
      element.textContent = "";
      return;
    }
    const loaded = new Date(data.loadedAt);
    const when = loaded.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const sheetCount = (data.sheetNames || []).length;
    const sheets = sheetCount > 1 ? ` · ${sheetCount} sheets` : "";
    element.textContent = `${data.fileName}${sheets} · loaded ${when}`;
    element.title = `${data.fileName}, loaded ${loaded.toLocaleString()}`;
  },

  // Shows a message under the load button, or hides it when the message is empty.
  showError(element, message) {
    element.textContent = message;
    element.hidden = !message;
  },

  // Opens the "pick columns" panel for one sheet.
  showMapping(panel, title) {
    panel.querySelector("#mapping-file").textContent = title;
    panel.hidden = false;
  },

  // Lists the top rows of a sheet so the user can say which one holds the headings.
  fillHeaderRowSelect(select, rows, selectedIndex) {
    select.replaceChildren();
    rows.slice(0, Loader.HEADER_SEARCH_ROWS).forEach((row, index) => {
      const preview = row.map((cell) => String(cell).trim()).filter(Boolean).join(" | ");
      const label = preview.length > 90 ? preview.slice(0, 90) + "…" : preview;
      const option = this.el("option", "", label);
      option.value = String(index);
      select.append(option);
    });
    select.value = String(selectedIndex);
  },

  // Fills the three column dropdowns with the heading row's names and preselects any detected ones.
  fillColumnSelects(selects, headers, mapping) {
    for (const field of Object.keys(selects)) {
      const select = selects[field];
      select.replaceChildren(this.el("option", "", "Choose a column…"));
      select.firstChild.value = "-1";
      headers.forEach((header, index) => {
        const option = this.el("option", "", String(header).trim() || `Column ${index + 1}`);
        option.value = String(index);
        select.append(option);
      });
      select.value = String(mapping[field]);
    }
  },
};
