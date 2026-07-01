import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GraphCanvas } from '../components/editor/nodes/graph/GraphCanvas';
import '../styles/vscode-theme.css';

window.addEventListener('error', (e) => {
  (window as unknown as { __graphErr?: string }).__graphErr = (e.error?.stack as string) || e.message;
});

// 预置各形状一个，看渲染是否真的成了对应形状。
const PRESET = JSON.stringify({
  kind: 'jgraph',
  version: 1,
  nodes: [
    { id: 'a', shape: 'rectangle', x: 60, y: 60, w: 120, h: 60, label: '矩形' },
    { id: 'b', shape: 'rounded', x: 60, y: 160, w: 120, h: 60, label: '圆角' },
    { id: 'c', shape: 'ellipse', x: 60, y: 260, w: 120, h: 80, label: '椭圆' },
    { id: 'd', shape: 'diamond', x: 60, y: 380, w: 80, h: 80, label: '菱形' },
  ],
  edges: [],
});

function Harness() {
  const [snap, setSnap] = useState(PRESET);
  return (
    <>
      <div id="canvas-host">
        <GraphCanvas initialSnapshot={PRESET} onChange={setSnap} editing />
      </div>
      <div id="dump" data-testid="snap-dump">{snap}</div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
