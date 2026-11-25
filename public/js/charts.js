/* Gráficos SVG sin dependencias — BIOSMART QR
   barChart (barras), donutChart (circular), lineChart (evolución temporal). */
'use strict';

const CHART_COLORS = ['#2d6a4f', '#52b788', '#ffd60a', '#40916c', '#95d5b2', '#8b5e34', '#74c69d', '#b7791f', '#7db8e8', '#1b4332'];
const svgNS = 'http://www.w3.org/2000/svg';
const escX = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Barras horizontales: data = [{label, value}] */
function barChart(data, opts = {}) {
  const width = 560, rowH = 34, padL = opts.padL || 160, padR = 54;
  const height = Math.max(40, data.length * rowH + 10);
  const max = Math.max(1, ...data.map((d) => d.value));
  const bars = data.map((d, i) => {
    const y = i * rowH + 6;
    const w = Math.max(3, ((width - padL - padR) * d.value) / max);
    return `
      <text x="${padL - 8}" y="${y + 17}" text-anchor="end" font-size="12.5" fill="#5b6b63" font-weight="600">${escX(d.label)}</text>
      <rect x="${padL}" y="${y + 4}" width="${w}" height="22" rx="7" fill="${CHART_COLORS[i % CHART_COLORS.length]}" opacity="0.92"/>
      <text x="${padL + w + 7}" y="${y + 19}" font-size="12.5" fill="#1b4332" font-weight="800">${d.value}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img">${bars}</svg>`;
}

/* Circular con leyenda: data = [{label, value}] */
function donutChart(data, opts = {}) {
  const size = 190, cx = size / 2, cy = size / 2, r = 76, sw = 34;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return `<div class="center-state"><div class="cs-ico">◔</div>—</div>`;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = data.map((d, i) => {
    const frac = d.value / total;
    const dash = frac * circumference;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CHART_COLORS[i % CHART_COLORS.length]}" stroke-width="${sw}"
      stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
    return arc;
  }).join('');
  const legend = data.map((d, i) =>
    `<span class="lg"><span class="dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${escX(d.label)} (${d.value})</span>`
  ).join('');
  const pct = Math.round((data[0].value / total) * 100);
  return `<svg viewBox="0 0 ${size} ${size}" role="img">${arcs}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="26" font-weight="800" fill="#1b4332">${total}</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="10.5" fill="#5b6b63">${escX(opts.centerLabel || '')}</text>
    </svg>
    <div class="legend">${legend}${data.length === 1 ? `<span class="lg">${pct}%</span>` : ''}</div>`;
}

/* Línea temporal: data = [{label, value}] (meses) */
function lineChart(data, opts = {}) {
  const width = 560, height = 210, padL = 40, padR = 16, padT = 18, padB = 34;
  if (!data.length) return `<div class="center-state">—</div>`;
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i) => padL + (i * (width - padL - padR)) / Math.max(1, data.length - 1);
  const y = (v) => padT + (height - padT - padB) * (1 - v / max);
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const grid = [0, 0.5, 1].map((g) => {
    const yy = padT + (height - padT - padB) * (1 - g);
    return `<line x1="${padL}" y1="${yy}" x2="${width - padR}" y2="${yy}" stroke="#dcebe0" stroke-width="1"/>
            <text x="${padL - 6}" y="${yy + 4}" text-anchor="end" font-size="10.5" fill="#5b6b63">${Math.round(max * g)}</text>`;
  }).join('');
  const dots = data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.value)}" r="4.5" fill="#2d6a4f"><title>${escX(d.label)}: ${d.value}</title></circle>`).join('');
  const labels = data.map((d, i) =>
    (data.length <= 8 || i % 2 === 0) ? `<text x="${x(i)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#5b6b63">${escX(d.label)}</text>` : ''
  ).join('');
  const area = `${padL},${height - padB} ${pts} ${x(data.length - 1)},${height - padB}`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img">
      ${grid}
      <polygon points="${area}" fill="#52b788" opacity="0.14"/>
      <polyline points="${pts}" fill="none" stroke="#2d6a4f" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}${labels}
    </svg>`;
}

window.barChart = barChart; window.donutChart = donutChart; window.lineChart = lineChart;
