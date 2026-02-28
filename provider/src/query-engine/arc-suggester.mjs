export function suggestArc(items, targetDurationMinutes) {
  const targetSeconds = targetDurationMinutes * 60;
  const arc = [];
  let totalDuration = 0;

  // Classify items by session fit
  const openers = items.filter(i => i.enrichment?.session_fit?.good_opener);
  const builders = items.filter(i => i.enrichment?.session_fit?.good_builder);
  const peaks = items.filter(i => i.enrichment?.session_fit?.good_peak);
  const closers = items.filter(i => i.enrichment?.session_fit?.good_closer);

  // Arc pattern: opener(s) -> builder(s) -> peak(s) -> closer(s)
  // Distribute roughly: 15% opener, 45% builder, 25% peak, 15% closer
  const segments = [
    { pool: openers, ratio: 0.15, label: 'opener' },
    { pool: builders, ratio: 0.45, label: 'builder' },
    { pool: peaks, ratio: 0.25, label: 'peak' },
    { pool: closers, ratio: 0.15, label: 'closer' }
  ];

  for (const segment of segments) {
    const segmentTarget = targetSeconds * segment.ratio;
    let segmentDuration = 0;
    const used = new Set(arc.map(a => a.item_id));

    // Sort by relevance (highest first)
    const available = segment.pool
      .filter(i => !used.has(i.item_id))
      .sort((a, b) => (b._relevance || 0) - (a._relevance || 0));

    for (const item of available) {
      const dur = item.source?.duration_seconds || 180;
      if (segmentDuration + dur > segmentTarget * 1.5) continue;
      arc.push({
        item_id: item.item_id,
        position: segment.label,
        duration_seconds: dur
      });
      segmentDuration += dur;
      totalDuration += dur;
      if (totalDuration >= targetSeconds) break;
    }

    if (totalDuration >= targetSeconds) break;
  }

  return arc;
}
