import { describe, expect, it } from 'vitest';
import { buildPaymentJourney } from '../../client/src/utils/paymentJourney.js';

const stages = ['Sent', 'Acknowledged', 'Approval', 'Scheduled', 'Processing'].map((label, i) => ({
  id: i + 1, label, sort_order: i, tone: 'info',
}));
const event = (id, stage_id, stage_label = stages[stage_id - 1]?.label || 'Former milestone') => ({
  id, stage_id, stage_label, stage_tone: 'info',
  created_at: `2026-10-${String(id + 10).padStart(2,'0')}T10:00:00Z`,
});

describe('visual payment journey', () => {
  it('renders all configured stages before there are any tracking updates', () => {
    const j = buildPaymentJourney(stages, []);
    expect(j.steps).toHaveLength(5);
    expect(j.steps.every((s) => s.state === 'upcoming')).toBe(true);
    expect(j.percent).toBe(0);
    expect(j.current).toBeNull();
  });

  it('only considers genuinely visited stages passed', () => {
    const j = buildPaymentJourney(stages, [event(1,1), event(2,3)]);
    expect(j.steps.map((s) => s.state)).toEqual(['passed','unrecorded','current','upcoming','upcoming']);
    expect(j.reached).toBe(2);
    expect(j.percent).toBe(40);
  });

  it('marks the latest event as current after moving backward', () => {
    const j = buildPaymentJourney(stages, [event(1,1), event(2,3), event(3,1)]);
    expect(j.current.id).toBe(1);
    expect(j.steps[0].state).toBe('current');
    expect(j.steps[2].state).toBe('passed');
    expect(j.reached).toBe(2);
  });

  it('does not lose a milestone after it is archived', () => {
    const j = buildPaymentJourney(stages, [event(1,1), event(2,99,'Old review stage')]);
    expect(j.steps).toHaveLength(6);
    expect(j.current.archived).toBe(true);
    expect(j.current.label).toBe('Old review stage');
    expect(j.steps[0].state).toBe('passed');
  });

  it('does not count repeated updates at the same milestone twice', () => {
    const j = buildPaymentJourney(stages, [event(1,2), event(2,2), event(3,2)]);
    expect(j.reached).toBe(1);
    expect(j.current.visitCount).toBe(3);
    expect(j.current.firstVisit.id).toBe(1);
    expect(j.current.lastVisit.id).toBe(3);
  });

  it('obeys custom stage ordering configured in Settings', () => {
    const changed = [...stages].reverse().map((s, i) => ({...s, sort_order: i}));
    expect(buildPaymentJourney(changed, [event(1,3)]).steps.map((s) => s.id)).toEqual([5,4,3,2,1]);
  });
});
