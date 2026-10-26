// Turns the configured payment stages and recorded events into an honest full-route view.
// Stages only become "passed" after an actual event; position alone does not prove completion.
// Recorded updates are sorted by creation time + ID, matching the API's event ordering.
export function buildPaymentJourney(stages = [], events = []) {
  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const history = [...events].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));

  const eventKey = (event) => event.stage_id == null
    ? `archived:${event.stage_label || 'Unknown stage'}`
    : `stage:${event.stage_id}`;
  const stageKey = (stage) => `stage:${stage.id}`;

  const byKey = new Map();
  for (const event of history) {
    const key = eventKey(event);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(event);
  }

  const steps = ordered.map((stage) => ({
    ...stage, key: stageKey(stage), archived: false,
  }));
  const known = new Set(steps.map((stage) => stage.key));
  // If a stage was archived or removed from Settings, its history still belongs on the journey.
  // Original ordering for archived stages is not available, so they are grouped at the end.
  for (const event of history) {
    const key = eventKey(event);
    if (!known.has(key)) {
      known.add(key);
      steps.push({
        id: event.stage_id, key, label: event.stage_label || 'Former stage',
        description: 'Historical stage no longer in the active settings list.',
        tone: event.stage_tone || 'neutral', archived: true,
      });
    }
  }

  const latest = history.at(-1) || null;
  const currentKey = latest ? eventKey(latest) : null;
  const currentIndex = steps.findIndex((step) => step.key === currentKey);
  const route = steps.map((step, index) => {
    const visits = byKey.get(step.key) || [];
    const firstVisit = visits[0] || null;
    const lastVisit = visits.at(-1) || null;
    let state = 'upcoming';
    if (visits.length && step.key === currentKey) state = 'current';
    else if (visits.length) state = 'passed';
    else if (currentIndex >= 0 && index < currentIndex) state = 'unrecorded';

    return { ...step, number: index + 1, state, firstVisit, lastVisit, visitCount: visits.length };
  });
  const reached = route.filter((step) => step.visitCount > 0).length;
  return {
    steps: route, latest, current: route.find((step) => step.state === 'current') || null,
    reached, total: route.length,
    percent: route.length ? Math.round(reached / route.length * 100) : 0,
  };
}
