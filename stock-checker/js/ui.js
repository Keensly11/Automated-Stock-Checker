// Everything that draws on the page: result cards, badges, summary, messages.
// Text is always set with textContent so spreadsheet values can't inject HTML.

const UI = {
  // Picks the availability badge for a product, from its stock count or its stock words.
  availability(product, threshold) {
    if (product.stock === null) return this.availabilityFromText(product.stockText);
    if (product.stock <= 0) return { label: "Out of stock", className: "badge-out" };
    if (product.stock <= threshold) return { label: "Low stock", className: "badge-low" };
    return { label: "In stock", className: "badge-in" };
  },

  // "Available" -> In stock, "Sold out" -> Out of stock, using CONFIG.availabilityWords.
  // Words that don't match any list are shown as they are, with a neutral badge.
  availabilityFromText(text) {
    const lower = String(text).toLowerCase().trim();
    const words = CONFIG.availabilityWords;
    const matches = (list) => list.some((word) =>
      word.length <= 3 ? lower === word : lower.includes(word));
    if (matches(words.out)) return { label: "Out of stock", className: "badge-out" };
    if (matches(words.low)) return { label: "Low stock", className: "badge-low" };
    if (matches(words.in)) return { label: "In stock", className: "badge-in" };
    return { label: text, className: "badge-other" };
  },

  stockDescription(product) {
    if (product.stock === null) return `Availability: ${product.stockText}`;
    return `Stock: ${product.stock} unit${product.stock === 1 ? "" : "s"}`;
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

  // One card per product: model and price on top, stock count and badge below,
  // and which sheet it came from when the file has several.
  createCard(product, settings, showSource) {
    const status = this.availability(product, settings.lowStockThreshold);
    const card = this.el("article", "card");
    card.append(
      this.el("div", "card-model", product.model),
      this.el("div", "card-price", this.formatPrice(product.price, product.currency)),
      this.el("div", "card-details", this.stockDescription(product)),
      this.el("span", `badge ${status.className}`, status.label),
    );
    if (showSource) card.append(this.el("div", "card-source", `Sheet: ${product.sheet}`));
    return card;
  },

  renderResults(container, products, settings, showSource) {
    container.replaceChildren();
    const shown = products.slice(0, CONFIG.maxResults);
    for (const product of shown) container.append(this.createCard(product, settings, showSource));
    if (products.length > shown.length) {
      container.append(this.el("p", "muted",
        `Showing ${shown.length} of ${products.length} matches. Type more to narrow it down.`));
    }
  },

  // "No match" box with clickable suggestions; onPick(model) runs when one is clicked.
  renderNotFound(container, query, suggestions, onPick) {
    container.replaceChildren();
    const box = this.el("div", "not-found");
    box.append(this.el("strong", "", `No model found for "${query}".`));
    if (suggestions.length) {
      box.append(this.el("div", "muted", "Did you mean:"));
      for (const product of suggestions) {
        const button = this.el("button", "suggestion", product.model);
        button.addEventListener("click", () => onPick(product.model));
        box.append(button);
      }
    }
    container.append(box);
  },

  clear(container) {
    container.replaceChildren();
  },

  renderSummary(element, products, settings) {
    if (!products.length) {
      element.textContent = "";
      return;
    }
    const badges = products.map((p) => this.availability(p, settings.lowStockThreshold).className);
    const out = badges.filter((b) => b === "badge-out").length;
    const low = badges.filter((b) => b === "badge-low").length;
    element.textContent = `${products.length} models · ${low} low stock · ${out} out of stock`;
  },

  // Status line next to the load button.
  renderFileStatus(element, data) {
    if (!data) {
      element.textContent = "No data loaded. Choose an Excel or CSV file, or drop it here.";
      return;
    }
    const date = new Date(data.loadedAt).toLocaleString();
    const sheetCount = (data.sheetNames || []).length;
    const sheets = sheetCount > 1 ? ` (${sheetCount} sheets)` : "";
    element.textContent = `Last loaded: ${data.fileName}${sheets}, ${date}`;
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
