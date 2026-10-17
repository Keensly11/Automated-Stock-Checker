// Settings for the stock checker, kept in one place so they're easy to change.

const CONFIG = {
  // Header names recognised for each column. Matching ignores case, spaces and symbols,
  // so "Model Name", "model_name" and "MODEL-NAME" all match "model name".
  // Add your own spreadsheet's header names here if they aren't detected.
  columns: {
    model: ["model", "model name", "model no", "model number", "product", "product name", "item", "item name",
            "description", "item description", "product description", "part number", "part no", "name", "sku"],
    stock: ["stock", "qty", "quantity", "in stock", "available", "availability", "stock qty", "units", "balance", "status"],
    price: ["price", "rate", "mrp", "cost", "selling price", "sale price", "unit price", "amount"],
  },

  // When the stock column holds words instead of numbers (e.g. "Available", "Out of stock"),
  // these decide the badge. Checked in order: out, then low, then in. Anything else shows as-is.
  availabilityWords: {
    out: ["out of stock", "not available", "unavailable", "sold out", "no stock", "no", "nil", "na", "n/a"],
    low: ["low", "limited", "few", "last"],
    in: ["available", "in stock", "yes", "ready", "stock"],
  },

  // Currency codes recognised in a price column's heading, e.g. "Unit Price (AED)".
  // (Currencies written in the price cells themselves are picked up whatever they are.)
  currencyCodes: ["AED", "Dhs", "Dh", "USD", "EUR", "GBP", "INR", "Rs", "SAR", "QAR", "KWD", "OMR", "BHD",
                  "PHP", "PKR", "LKR", "NPR", "BDT", "SGD", "MYR", "AUD", "CAD", "JPY", "CNY"],

  // Defaults the user can change in the Settings panel.
  defaults: {
    lowStockThreshold: 5, // stock at or below this shows "Low stock"
  },

  maxResults: 50,     // most result cards shown at once
  maxSuggestions: 5,  // "Did you mean" suggestions when nothing matches
};
