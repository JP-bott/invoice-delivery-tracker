import { ArrowUpRight, CalendarClock, Check, Circle, Clock3, Flag, MapPin, Route } from 'lucide-react';
import { peso } from '../../utils/api.js';
import { today } from '../../utils/dates.js';
import { buildPaymentJourney } from '../../utils/paymentJourney.js';
import './payment-journey.css';

const dateLabel = (s) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
}).format(new Date(s));

const labels = {
  passed: 'Passed',
  current: 'Current location',
  upcoming: 'Upcoming',
  unrecorded: 'Not recorded',
};

function JourneyStage({ step, next, canEdit, onChoose }) {
  const isCurrent = step.state === 'current';
  const passed = step.state === 'passed';
  const reachedNext = next && next.visitCount > 0;
  return (
    <li className={`pj-step pj-${step.state} pj-tone-${step.tone || 'neutral'}`}>
      {next && <span aria-hidden="true" className={`pj-connector ${step.visitCount && reachedNext ? 'pj-connector-visited' : ''}`} />}
      <span className="pj-stage-node" aria-hidden="true">
        {isCurrent ? <MapPin size={20} strokeWidth={2.4} /> : passed ? <Check size={19} strokeWidth={2.7} /> : <span className="pj-stage-number">{String(step.number).padStart(2, '0')}</span>}
      </span>

      <div className="pj-stage-card">
        <div className="pj-stage-head">
          <span className="pj-stage-sequence">STAGE {String(step.number).padStart(2, '0')}{step.archived ? ' · ARCHIVED' : ''}</span>
          <span className="pj-stage-badge">{isCurrent && <span className="pj-live-dot" aria-hidden="true"/>}{labels[step.state]}</span>
        </div>
        <h4 className="pj-stage-title">{isCurrent ? step.lastVisit?.stage_label || step.label : step.label}</h4>
        {step.description && <p className="pj-stage-description">{step.description}</p>}
        {step.firstVisit ? (
          <div className="pj-stage-meta">
            <CalendarClock size={14} aria-hidden="true" />
            <span>Reached {dateLabel(step.firstVisit.created_at)}</span>
            {step.visitCount > 1 && <span className="pj-stage-revisited">· {step.visitCount} updates</span>}
          </div>
        ) : <p className="pj-stage-meta">
          <Clock3 size={14} aria-hidden="true" />
          {step.state === 'unrecorded' ? 'No recorded visit to this stage' : 'No update recorded yet'}
        </p>}
        {step.lastVisit?.note && <p className={`pj-stage-note ${isCurrent ? 'pj-stage-note-current' : ''}`}>{step.lastVisit.note}</p>}
        {isCurrent && <div className="pj-current-indicator"><MapPin size={13} aria-hidden="true"/> YOU ARE HERE</div>}
        {canEdit && !step.archived && <button type="button" className="pj-stage-select" onClick={() => onChoose(step.id)}
          aria-label={`Record a payment update at ${step.label}`}>Record an update here <ArrowUpRight size={13} aria-hidden="true"/></button>}
      </div>
    </li>
  );
}

// The route always shows ALL configured stages. Only actual events establish that a stage was visited.
// An out-of-order event does not imply that earlier milestones were completed.
export default function PaymentJourney({ invoice, stages, events, canEdit = false, onChooseStage }) {
  const journey = buildPaymentJourney(stages, events);
  const currentLabel = journey.latest?.stage_label || 'Not started';
  const overdue = invoice.due_date && invoice.due_date < today() && Number(invoice.outstanding) > 0;
  return (
    <section className="pj-shell" aria-label="Complete payment stage journey">
      <div className="pj-overview">
        <div className="pj-overview-top">
          <div className="pj-overview-main">
            <span className="pj-eyebrow"><Route size={15} aria-hidden="true" /> PAYMENT JOURNEY</span>
            <h3>{currentLabel}</h3>
            <p>{journey.latest ? `Last recorded ${dateLabel(journey.latest.created_at)}` : 'Add a tracking update to mark the first stage.'}</p>
          </div>
          <div className="pj-outstanding">
            <span>OUTSTANDING BALANCE</span>
            <strong>{peso(invoice.outstanding)}</strong>
            <div><span className={`pj-invoice-pill ${overdue ? 'pj-pill-overdue' : ''}`}>{overdue ? 'Overdue' : invoice.payment_status}</span></div>
          </div>
        </div>
        <div className="pj-progress-title">
          <div><span className="pj-progress-count">{journey.reached}</span><span> / {journey.total} milestones recorded</span></div>
          <span className="pj-percent">{journey.percent}%</span>
        </div>
        <div className="pj-meter" role="progressbar" aria-label="Recorded payment stages" aria-valuemin={0} aria-valuemax={journey.total} aria-valuenow={journey.reached}>
          <span style={{ width: `${journey.percent}%` }} />
        </div>
        <p className="pj-progress-footnote">Progress reflects recorded stages, not automatic payment confirmation.</p>
      </div>

      <div className="pj-route-heading">
        <div>
          <p className="pj-section-kicker">PAYMENT ROUTE</p>
          <h3>Stage-by-stage tracking</h3>
          <p>See every milestone, the stages visited, and where this invoice stands today.</p>
        </div>
        <span className="pj-route-count"><Flag size={15} aria-hidden="true"/>{journey.total} stages</span>
      </div>

      <div className="pj-legend" aria-label="Timeline status legend">
        <span><i className="pj-legend-dot pj-legend-passed"/> Passed</span>
        <span><i className="pj-legend-dot pj-legend-current"/> Current</span>
        <span><i className="pj-legend-dot pj-legend-upcoming"/> Upcoming</span>
        {journey.steps.some((step) => step.state === 'unrecorded') &&
          <span><i className="pj-legend-dot pj-legend-unrecorded"/> Unrecorded</span>}
      </div>

      {journey.steps.length ? <ol className="pj-route-list">
        {journey.steps.map((step, index) => <JourneyStage key={step.key} step={step} next={journey.steps[index + 1]} canEdit={canEdit} onChoose={onChooseStage} />)}
      </ol> : <div className="pj-empty">
        <Circle size={21} aria-hidden="true" />
        No payment stages configured yet. Add stages in Settings to build a tracking journey.
      </div>}

      {journey.steps.some((step) => step.archived) && <p className="pj-archive-note">Archived milestones are shown after active stages because their original position is no longer available.</p>}
    </section>
  );
}
