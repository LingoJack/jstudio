/**
 * buildMermaidPreviewWindowHtml - builds the standalone HTML document used
 * when opening a Mermaid diagram in a separate OS preview window.
 *
 * Extracted from CodeBlockView's `openWindowBtn` onClick handler. This is a
 * pure string builder - it takes the rendered SVG and the current colour
 * scheme and returns a complete HTML document with pan / zoom controls.
 */

/**
 * Build the full HTML document for the mermaid preview window.
 *
 * @param svg        - The rendered mermaid SVG markup.
 * @param isDarkMode - Whether dark mode is active (controls background /
 *                     button colours).
 * @returns A complete `<!DOCTYPE html>` document string.
 */
export function buildMermaidPreviewWindowHtml(
  svg: string,
  isDarkMode: boolean,
): string {
  const bg = isDarkMode
    ? "linear-gradient(135deg, #1e1e1e 0%, #252526 100%)"
    : "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)";
  const btnBg = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";
  const btnHover = isDarkMode
    ? "rgba(255,255,255,0.2)"
    : "rgba(0,0,0,0.12)";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html,body{margin:0;padding:0;height:100%;overflow:hidden}
    body{background:${bg};cursor:grab;user-select:none}
    body.dragging{cursor:grabbing}
    .w{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
    svg{display:block}
    .c{position:fixed;top:8px;right:8px;display:flex;gap:2px;opacity:0.5;transition:opacity 0.2s}
    body:hover .c{opacity:1}
    .b{width:28px;height:28px;border:none;border-radius:4px;background:${btnBg};cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
    .b:hover{background:${btnHover}}
  </style>
</head>
<body>
  <div class="w" id="w">${svg}</div>
  <div class="c">
    <button class="b" onclick="z(0.8)">−</button>
    <button class="b" onclick="z(1.25)">+</button>
    <button class="b" onclick="fit()">⊗</button>
  </div>
  <script>
    const w=document.getElementById('w'),s=document.querySelector('svg');
    let scale=1,px=0,py=0;
    const upd=()=>w.style.transform='translate(-50%,-50%)translate('+px+'px,'+py+'px)scale('+scale+')';
    const z=d=>{scale=Math.max(0.1,Math.min(scale*d,5));upd()};
    const fit=()=>{const v=s.getAttribute('viewBox')?.split(' ').map(Number)||[0,0,s.getBBox().width,s.getBBox().height];const b=document.body.getBoundingClientRect();scale=Math.min((b.width*0.9)/v[2],(b.height*0.9)/v[3],3);px=0;py=0;upd()};
    setTimeout(fit,50);
    addEventListener('wheel',e=>{e.preventDefault();if(e.altKey){z(e.deltaY>0?0.9:1.1)}else{px-=e.deltaX;py-=e.deltaY;upd()}},{passive:false});
    let drag=0,sx,sy,sp,st;
    onmousedown=e=>{drag=1;sx=e.clientX;sy=e.clientY;sp=px;st=py;document.body.classList.add('dragging')};
    onmousemove=e=>{if(!drag)return;px=sp+e.clientX-sx;py=st+e.clientY-sy;upd()};
    onmouseup=()=>{drag=0;document.body.classList.remove('dragging')};
  </script>
</body>
</html>`;
}
