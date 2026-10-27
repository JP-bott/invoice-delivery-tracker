import { useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, MoveHorizontal, Sparkles } from 'lucide-react';
import './background-comparison.css';

/**
 * One surface for the original image, AI processing state, and the draggable
 * before/after reveal. The *actual divider* is draggable using Pointer Events;
 * keyboard arrows / Home / End also work without a separate range input.
 */
export default function BackgroundComparison({
  originalUrl, processedUrl, dimensions, compare, onCompare, processing, checking, progress, succeeded = false,
}) {
  const frameRef = useRef(null);
  const pointerId = useRef(null);
  const [dragging, setDragging] = useState(false);
  const hasResult = Boolean(processedUrl);

  const updatePosition = (event) => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const percentage = Math.round(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)));
    onCompare(percentage);
  };
  const pointerDown = (event) => {
    if (!hasResult || event.button !== 0) return;
    event.preventDefault();
    frameRef.current?.setPointerCapture(event.pointerId);
    pointerId.current = event.pointerId;
    setDragging(true);
    updatePosition(event);
  };
  const pointerMove = (event) => {
    if (pointerId.current !== event.pointerId) return;
    updatePosition(event);
  };
  const pointerEnd = (event) => {
    if (pointerId.current !== event.pointerId) return;
    updatePosition(event);
    if (frameRef.current?.hasPointerCapture(event.pointerId)) {
      frameRef.current.releasePointerCapture(event.pointerId);
    }
    pointerId.current = null;
    setDragging(false);
  };
  const pointerCancel = (event) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    setDragging(false);
  };
  const keyDown = (event) => {
    if (!hasResult) return;
    const step = event.shiftKey ? 10 : 2;
    const values = {
      ArrowLeft: Math.max(0, compare - step),
      ArrowDown: Math.max(0, compare - step),
      ArrowRight: Math.min(100, compare + step),
      ArrowUp: Math.min(100, compare + step),
      Home: 0, End: 100,
    };
    if (Object.hasOwn(values, event.key)) {
      event.preventDefault();
      onCompare(values[event.key]);
    }
  };

  if (!originalUrl) {
    return <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-line bg-surface-2/50 text-center">
      <div>
        <MoveHorizontal size={29} className="mx-auto text-fg-subtle" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-fg">Your preview will appear here</p>
        <p className="mt-1 text-xs text-fg-muted">Upload an image to begin</p>
      </div>
    </div>;
  }

  return <div className="space-y-3">
    <div
      ref={frameRef}
      className={`br-compare-frame ${hasResult ? 'br-compare-enabled' : ''} ${dragging ? 'br-compare-dragging' : ''}`}
      style={{aspectRatio: dimensions?.width && dimensions?.height ? `${dimensions.width} / ${dimensions.height}` : '4 / 3'}}
      role={hasResult ? 'slider' : undefined}
      tabIndex={hasResult ? 0 : undefined}
      aria-label={hasResult ? 'Drag to compare background removed and original images' : undefined}
      aria-valuemin={hasResult ? 0 : undefined}
      aria-valuemax={hasResult ? 100 : undefined}
      aria-valuenow={hasResult ? compare : undefined}
      aria-valuetext={hasResult ? `${compare}% of the background-removed image visible` : undefined}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerCancel}
      onKeyDown={keyDown}
    >
      <div className="br-checkerboard" aria-hidden="true" />
      <img src={originalUrl} alt="Original uploaded image" className="br-compare-image" draggable={false}/>
      {hasResult && <>
        <div className="br-revealed" style={{clipPath: `inset(0 ${100 - compare}% 0 0)`}} aria-hidden="true">
          <div className="br-checkerboard" />
          <img src={processedUrl} alt="" className="br-compare-image" draggable={false} />
        </div>
        <div className="br-divider" style={{left: `${compare}%`}} aria-hidden="true">
          <span className="br-divider-handle">
            <ChevronLeft size={15} strokeWidth={2.5}/>
            <ChevronRight size={15} strokeWidth={2.5}/>
          </span>
        </div>
        <span className="br-label br-label-left" aria-hidden="true">Background removed</span>
        <span className="br-label br-label-right" aria-hidden="true">Original</span>
      </>}
      {!hasResult && <span className="br-label br-label-left" aria-hidden="true">Original image</span>}
      {(processing || checking || succeeded) && (
        <div className={`br-processing-overlay ${succeeded ? "br-processing-success" : ""}`} role="status" aria-live="polite">
          <div className="br-processing-panel">
            {succeeded ? <>
              <div className="br-processing-orbit br-success-orbit" aria-hidden="true">
                <CheckCircle2 className="br-success-check" size={56} strokeWidth={1.9}/>
              </div>
              <p className="br-processing-title">Done!</p>
              <p className="br-processing-message">Your photo is ready.</p>
            </> : <>
              <div className="br-processing-orbit" aria-hidden="true">
                <span className="br-processing-halo"/>
                <LoaderCircle className="br-processing-spinner" size={48} strokeWidth={2.2}/>
                <Sparkles className="br-processing-center" size={19}/>
              </div>
              <p className="br-processing-title">{checking ? 'Checking photo…' : 'Removing background…'}</p>
              <p className="br-processing-message">{checking ? 'Almost ready…' : progress?.message || 'Getting ready…'}</p>
              <div className="br-progress-track" aria-hidden="true">
                {processing && Number.isFinite(progress?.percent)
                  ? <div className="br-progress-known" style={{width:`${progress.percent}%`}}/>
                  : null}
                <div className="br-progress-active" />
              </div>
              <p className="br-processing-note">
                {processing ? 'This may take a little while.' : 'Getting ready…'}
              </p>
            </>}
          </div>
        </div>
      )}
    </div>
    {hasResult && <p className="flex items-center justify-center gap-2 text-xs text-fg-muted">
      <MoveHorizontal size={15} aria-hidden="true"/>
      Drag the line to compare.
    </p>}
  </div>;
}
