
import { average, linearTrend } from './statistics.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_MS = 86400000;
const VIEW_WIDTH = 760;

function dateFmt(value) {
  return new Date(value).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function fmt(value) {
  return Number.isFinite(value)
    ? value.toLocaleString('de-AT', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })
    : '—';
}

function addSvgElement(svg, tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  svg.appendChild(element);
  return element;
}

/*
 * Bestimmt die logische Höhe passend zum sichtbaren Container.
 * Dadurch bleibt die SVG-Skalierung proportional, ohne große
 * ungenutzte Bereiche ober- und unterhalb des Diagramms.
 */
function getChartDimensions(svg) {
  const rect = svg.getBoundingClientRect();
  const width = rect.width || VIEW_WIDTH;
  const height = rect.height || 250;

  return {
    W: VIEW_WIDTH,
    H: VIEW_WIDTH * height / width
  };
}

function rollingSevenDayAverage(records) {
  const windowMs = 7 * DAY_MS;
  const result = [];

  for (let i = 0; i < records.length; i++) {
    const currentTime = new Date(records[i].date).getTime();
    const windowRecords = [];

    for (let j = i; j >= 0; j--) {
      const time = new Date(records[j].date).getTime();

      if (currentTime - time > windowMs) break;
      windowRecords.push(records[j]);
    }

    if (windowRecords.length >= 2) {
      result.push({
        time: currentTime,
        weight: average(windowRecords)
      });
    }
  }

  return result;
}

function renderEmpty(svg, message, H) {
  addSvgElement(svg, 'text', {
    x: VIEW_WIDTH / 2,
    y: H / 2,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    fill: 'currentColor',
    'font-size': 15
  }).textContent = message;
}

export function renderChart(records, range, axisStepValue) {
  const svg = document.getElementById('chart');
  svg.innerHTML = '';

  const { W, H } = getChartDimensions(svg);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const emptyMessage = 'Noch keine Messwerte für diesen Zeitraum';

  if (!range) {
    renderEmpty(svg, emptyMessage, H);
    document.getElementById('startLabel').textContent = '—';
    document.getElementById('endLabel').textContent = '—';
    return;
  }

  document.getElementById('startLabel').textContent = dateFmt(range.start);
  document.getElementById('endLabel').textContent = dateFmt(range.endDay);

  if (!records.length) {
    renderEmpty(svg, emptyMessage, H);
    return;
  }

  const L = 38;
  const R = 48;
  const T = 18;
  const B = 34;

  const plotHeight = H - T - B;
  const times = records.map(record => new Date(record.date).getTime());
  const dataMin = Math.min(...records.map(record => record.weight));
  const dataMax = Math.max(...records.map(record => record.weight));
  const step = Math.max(1, Number(axisStepValue) || 2);

  let min = Math.floor(dataMin / step) * step;
  let max = Math.ceil(dataMax / step) * step;

  if (min === max) {
    min -= step;
    max += step;
  }

  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();

  const x = time =>
    L + (time - rangeStart) /
      Math.max(1, rangeEnd - rangeStart) * (W - L - R);

  const y = value =>
    T + (max - value) / (max - min) * plotHeight;

  for (let value = min; value <= max + step * 0.001; value += step) {
    const py = y(value);

    addSvgElement(svg, 'line', {
      x1: L,
      y1: py,
      x2: W - R,
      y2: py,
      stroke: 'light-dark(#d8d8de,#4a4a50)',
      'stroke-width': 1,
      'stroke-dasharray': '3 4'
    });

    addSvgElement(svg, 'text', {
      x: W - R + 7,
      y: py + 4,
      fill: 'light-dark(#777780,#a1a1aa)',
      'font-size': 11
    }).textContent = fmt(value);
  }

  const pointRadius = records.length > 80 ? 1.8 : 3;

  records.forEach(record => {
    const time = new Date(record.date).getTime();

    addSvgElement(svg, 'circle', {
      cx: x(time),
      cy: y(record.weight),
      r: pointRadius,
      fill: 'light-dark(#9296a0,#aeb3c0)',
      opacity: 0.72
    });
  });

  const rolling = rollingSevenDayAverage(records);

  if (rolling.length >= 2) {
    const points = rolling
      .map(point => `${x(point.time)},${y(point.weight)}`)
      .join(' ');

    addSvgElement(svg, 'polyline', {
      points,
      fill: 'none',
      stroke: 'light-dark(#5f718b,#b8c7e0)',
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round'
    });
  }

  const trend = linearTrend(records);

  return {
    rollingAveragePoints: rolling.length,
    hasLinearTrend: Boolean(trend)
  };
}
