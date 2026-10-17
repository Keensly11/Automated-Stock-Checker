// Finds products whose model name matches what the user typed.

const Search = {
  // "ABC-100 x" -> "abc100x", so case, spaces and dashes don't matter when matching.
  normalize(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
  },

  // Returns matching products, best first: exact match, then starts-with, then contains.
  find(products, query) {
    const q = this.normalize(query);
    if (!q) return [];

    const exact = [];
    const startsWith = [];
    const contains = [];
    for (const product of products) {
      const key = this.normalize(product.model);
      if (key === q) exact.push(product);
      else if (key.startsWith(q)) startsWith.push(product);
      else if (key.includes(q)) contains.push(product);
    }
    return exact.concat(startsWith, contains);
  },

  // When nothing matches, returns up to `limit` models that are spelled closest to the query.
  suggest(products, query, limit) {
    const q = this.normalize(query);
    if (!q) return [];
    const maxDistance = Math.max(2, Math.floor(q.length / 2));

    return products
      .map((product) => ({
        product,
        distance: this.editDistance(q, this.normalize(product.model)),
      }))
      .filter((item) => item.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((item) => item.product);
  },

  // Number of single-letter edits needed to turn `a` into `b` (Levenshtein distance).
  editDistance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      }
      previous = current;
    }
    return previous[b.length];
  },
};
