export function summarizeReviewSelection(visibleIds, selectedIds) {
  const visible = [...visibleIds];
  const selectedCount = visible.filter((id) => selectedIds.has(id)).length;
  const allSelected = visible.length > 0 && selectedCount === visible.length;
  return {
    visibleCount: visible.length,
    selectedCount,
    allSelected,
    someSelected: selectedCount > 0 && !allSelected
  };
}

export function setVisibleReviewSelection(visibleIds, selectedIds, selected) {
  for (const id of visibleIds) {
    if (selected) selectedIds.add(id);
    else selectedIds.delete(id);
  }
}

export function makeDictionaryDispatchChunks(base, items, maxItems = 60, maxBytes = 60_000) {
  const chunks = [];
  let current = [];
  const encode = (group) => JSON.stringify({ ...base, items: group });
  const byteLength = (serialized) => new TextEncoder().encode(serialized).length;

  for (const item of items) {
    const candidate = [...current, item];
    const serialized = encode(candidate);
    if (candidate.length > maxItems || byteLength(serialized) > maxBytes) {
      if (!current.length) throw new RangeError("A dictionary item exceeds the dispatch size limit.");
      const previous = encode(current);
      chunks.push({ serialized: previous, ids: current.map(({ id }) => id) });
      current = [item];
      if (byteLength(encode(current)) > maxBytes) throw new RangeError("A dictionary item exceeds the dispatch size limit.");
    } else {
      current = candidate;
    }
  }

  if (current.length) chunks.push({ serialized: encode(current), ids: current.map(({ id }) => id) });
  return chunks;
}
