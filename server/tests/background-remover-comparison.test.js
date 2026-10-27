import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
describe('background remover comparison and loading experience', () => {
  const page = read('../../client/src/pages/BackgroundRemover.jsx');
  const comparison = read('../../client/src/components/background/BackgroundComparison.jsx');

  it('removes the refinement editor and old below-image range control', () => {
    expect(page).not.toContain('BackgroundStudio');
    expect(page).not.toContain('aiCutout');
    expect(page).not.toContain('type="range"');
    expect(page).toContain('<BackgroundComparison');
    expect(page).toContain('width="max-w-4xl"');
    expect(page).not.toContain('aria-label="Before and after preview"');
  });

  it('supports direct pointer drag on the image and accessible keyboard input', () => {
    expect(comparison).toContain('onPointerDown={pointerDown}');
    expect(comparison).toContain('onPointerMove={pointerMove}');
    expect(comparison).toContain('setPointerCapture(event.pointerId)');
    expect(comparison).toContain("role={hasResult ? 'slider'");
    expect(comparison).toContain('ArrowLeft:');
    expect(comparison).toContain('Home: 0, End: 100');
  });

  it('shows continuous activity indicators independently from model download progress', () => {
    expect(comparison).toContain('br-processing-spinner');
    expect(comparison).toContain('br-progress-active');
    expect(comparison).toContain('Number.isFinite(progress?.percent)');
    expect(comparison).toContain('This may take a little while.');
    expect(page).toContain('processing={busy}');
    expect(comparison).toContain('br-success-check');
    expect(page).toContain('succeeded={successVisible}');
    expect(page).not.toContain('Your image is ready');
  });

  it('keeps download and original dimensions', () => {
    expect(page).toContain("transparentFileName(file.name)");
    expect(page).toContain('const download=()=>');
    expect(comparison).toContain('dimensions.width');
    expect(comparison).toContain('dimensions.height');
  });
});
