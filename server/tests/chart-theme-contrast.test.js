import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

describe('chart colors and tooltip contrast',()=>{
  const css=read('../../client/src/index.css');
  const page=read('../../client/src/pages/Dashboard.jsx');
  const tip=read('../../client/src/components/dashboard/DashboardTooltip.jsx');
  it('has distinct readable tooltip surfaces and text in both themes',()=>{
    const light=css.slice(css.indexOf(':root {'),css.indexOf('.dark {'));
    const dark=css.slice(css.indexOf('.dark {'),css.indexOf('@media (min-width: 768px)'));
    for(const block of [light,dark]){
      expect(block).toContain('--tooltip-bg:');
      expect(block).toContain('--tooltip-fg:');
      expect(block).toContain('--tooltip-border:');
      expect(block).toContain('--chart-positive:');
      expect(block).toContain('--chart-negative:');
    }
    expect(light).not.toContain('--tooltip-bg: #14171f;');
    expect(dark).not.toContain('--tooltip-bg: #eef0f4;');
  });
  it('uses consistent tooltip content and no default tooltip styles in the active dashboard',()=>{
    expect(page).toContain('DashboardTooltip');
    expect(page).not.toContain('<Tooltip ');
    expect(page).not.toContain('contentStyle={tipStyle}');
    expect(tip).toContain('var(--tooltip-fg)');
    expect(tip).toContain('chart-tooltip-muted');
    expect(tip).toContain('var(--chart-hover-fill)');
  });
  it('uses soft data colors and retains special high and low months',()=>{
    expect(page).toContain('var(--chart-positive)');
    expect(page).toContain('var(--chart-caution)');
    expect(page).toContain('var(--chart-negative)');
    expect(css).toContain('.recharts-bar-rectangle:hover');
  });
});
