export function rankItems(items, weights) {
  const weightEntries = Object.entries(weights);
  if (weightEntries.length === 0) return items;

  const scored = items.map(item => {
    let relevance = 0;
    let totalWeight = 0;
    const categories = item.enrichment?.categories || [];

    for (const [categoryId, weight] of weightEntries) {
      const match = categories.find(c => c.id === categoryId);
      if (match) {
        relevance += match.confidence * weight;
      }
      totalWeight += weight;
    }

    // Normalize
    if (totalWeight > 0) {
      relevance /= totalWeight;
    }

    return { ...item, _relevance: Math.round(relevance * 1000) / 1000 };
  });

  return scored.sort((a, b) => b._relevance - a._relevance);
}
