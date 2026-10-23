import {
  loadData,
  saveData,
  createExportData
} from './storage.js';

import {
  uniqueDays,
  average,
  linearTrend,
  trendDelta,
  getGoalDirection,
  getGoalProgress,
  getGoalStatus
} from './statistics.js';

import { renderChart } from './chart.js';

const DAY_MS = 86400000;
const $ = id => document.getElementById(id);

let { records, goal } = loadData();
let selectedPeriod = '30';

function fmt(value) {
  return Number.isFinite(value)
    ? value.toLocaleString('de-AT', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })
    : '—';
}

function kg(value) {
  return Number.isFinite(value) ? fmt(value) + ' kg' : '—';
}

function dateFmt(value) {
  return new Date(value).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function dateInputFmt(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function save() {
  saveData(records, goal);
  render();
}

/* Datumsgrenzen für Anzeige und Diagrammachse. */
function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function dateFromInput(value) {
  if (!value) return null;

  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some(number => !Number.isFinite(number))) {
    return null;
  }

  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getChartRange() {
  const today = startOfDay(new Date());
  const todayEnd = endOfDay(today);

  if (selectedPeriod === 'custom') {
    const fromInput = dateFromInput($('fromDate').value);
    const toInput = dateFromInput($('toDate').value);
    const earliest = records.length
      ? startOfDay(records[0].date)
      : null;

    const start = fromInput || earliest;
    const endDay = toInput || today;

    return start
      ? {
          start,
          end: endOfDay(endDay),
          endDay,
          labelEnd: toInput ? dateFmt(endDay) : 'Heute'
        }
      : null;
  }

  if (selectedPeriod === 'all') {
    if (!records.length) return null;

    const start = startOfDay(records[0].date);

    return {
      start,
      end: todayEnd,
      endDay: today,
      labelEnd: 'Heute'
    };
  }

  const days = Number(selectedPeriod);
  const start = new Date(today);
  start.setDate(start.getDate() - days);

  return {
    start,
    end: todayEnd,
    endDay: today,
    labelEnd: 'Heute'
  };
}

function filterPeriod() {
  if (!records.length) return [];

  const range = getChartRange();
  if (!range) return [];

  const startTime = range.start.getTime();
  const endTime = range.end.getTime();

  return records.filter(record => {
    const time = new Date(record.date).getTime();
    return time >= startTime && time <= endTime;
  });
}

function render() {
  const all = records;
  const periodRecords = filterPeriod();
  const chartRange = getChartRange();
  const latest = all[all.length - 1];

  // Die jüngsten 28 Tage relativ zur letzten Messung.
  const last28 = latest
    ? all.filter(record =>
        new Date(record.date).getTime() >=
        new Date(latest.date).getTime() - 28 * DAY_MS
      )
    : [];

  const trend = linearTrend(last28);
  const rate = trend ? trend.slope * 7 : NaN;

  $('trendWeight').textContent = trend
    ? kg(trend.predict(
        (new Date(latest.date).getTime() - trend.t0) / DAY_MS
      ))
    : latest
      ? kg(latest.weight)
      : '—';

  $('weeklyRate').textContent = Number.isFinite(rate)
    ? (rate < 0 ? '↘ ' : '↗ ') + fmt(rate) + ' kg / Woche'
    : 'Noch nicht genug Messwerte';

  $('lastEntry').textContent = latest
    ? 'Letzte Messung ' + kg(latest.weight) + ', ' + dateFmt(latest.date)
    : 'Trage dein erstes Gewicht ein.';

  // Zielgewicht
  if (goal !== null) {
    $('goalInput').value = goal;
    $('goalValue').textContent = kg(goal);

    const direction = getGoalDirection(all, goal);

    $('goalType').textContent =
      direction === 'loss' ? 'Abnehmen'
      : direction === 'gain' ? 'Zunehmen'
      : 'Zielgewicht';

    $('progressBar').style.width =
      getGoalProgress(all, goal, direction) + '%';

    $('remaining').textContent =
      getGoalStatus(all, goal, direction, kg);

    if (
      latest &&
      trend &&
      Math.abs(rate) > 0.005 &&
      (goal - latest.weight) / trend.slope > 0
    ) {
      const days = (goal - latest.weight) / trend.slope;
      const date = new Date(
        new Date(latest.date).getTime() + days * DAY_MS
      );

      $('goalDate').textContent =
        'Wenn der Trend anhält: etwa ' + dateFmt(date) + '.';
    } else {
      $('goalDate').textContent = latest
        ? 'Mit aktuellem Trend keine sinnvolle Zielprognose.'
        : 'Lege Messwerte an, um eine Prognose zu sehen.';
    }
  } else {
    $('goalValue').textContent = 'Nicht festgelegt';
    $('goalType').textContent = 'Ziel';
    $('remaining').textContent = 'Lege ein Zielgewicht fest.';
    $('goalDate').textContent = '';
    $('progressBar').style.width = '0%';
  }

  // Zeitraum
  $('rangeMeta').textContent = chartRange
    ? dateFmt(chartRange.start) + ' – ' + chartRange.labelEnd
    : 'Keine Messungen';

  const periodNames = {
    '7': '1 Woche',
    '30': '1 Monat',
    '90': '3 Monate',
    '180': '6 Monate',
    '365': '1 Jahr',
    all: 'Alle',
    custom: 'Eigener Zeitraum'
  };

  $('statsPeriod').textContent =
    periodNames[selectedPeriod] || 'Zeitraum';

  // Statistiken für den ausgewählten Zeitraum
  const delta = trendDelta(periodRecords);

  $('statTrend').textContent = Number.isFinite(delta)
    ? (delta > 0 ? '+' : '') + kg(delta)
    : '—';

  $('statAvg').textContent = kg(average(periodRecords));

  $('statMin').textContent = periodRecords.length
    ? kg(Math.min(...periodRecords.map(record => record.weight)))
    : '—';

  $('statMax').textContent = periodRecords.length
    ? kg(Math.max(...periodRecords.map(record => record.weight)))
    : '—';

  $('statCount').textContent = periodRecords.length;
  $('statDays').textContent = uniqueDays(periodRecords);

  $('rateDetail').textContent = Number.isFinite(rate)
    ? (rate > 0 ? '+' : '') + fmt(rate) + ' kg / Woche'
    : '—';

  $('forecastDetail').textContent = latest && trend
    ? 'Trend der letzten 28 Tage; berechnet aus ' + last28.length + ' Messungen.'
    : 'Für eine Rate werden mindestens fünf Messungen über mindestens 14 Tage benötigt.';

  // Diagramm
  renderChart(periodRecords, chartRange, $('axisStep').value);

  // Messtabelle: alle Messungen anzeigen, neueste zuerst.
  $('entryCount').textContent = all.length + ' Einträge';
  $('entriesBody').innerHTML = '';

  [...all].reverse().forEach(record => {
    const row = document.createElement('tr');

    const date = document.createElement('td');
    date.textContent = new Date(record.date).toLocaleString('de-AT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const weight = document.createElement('td');
    weight.textContent = kg(record.weight);

    const note = document.createElement('td');
    note.textContent = record.note || '—';

    const action = document.createElement('td');
    const button = document.createElement('button');

    button.className = 'delete';
    button.textContent = '×';
    button.title = 'Messung löschen';
    button.setAttribute('aria-label', 'Messung vom ' + date.textContent + ' löschen');

    button.onclick = () => {
      if (!confirm('Diese Messung löschen?')) return;

      records = records.filter(item => item.id !== record.id);
      save();
    };

    action.appendChild(button);
    [date, weight, note, action].forEach(cell => row.appendChild(cell));
    $('entriesBody').appendChild(row);
  });
}

// Zeitraumauswahl
$('periods').addEventListener('click', event => {
  const button = event.target.closest('[data-period]');
  if (!button) return;

  selectedPeriod = button.dataset.period;

  document.querySelectorAll('.period').forEach(item => {
    item.classList.toggle('active', item === button);
  });

  $('customDates').style.display =
    selectedPeriod === 'custom' ? 'grid' : 'none';

  render();
});

$('fromDate').onchange = render;
$('toDate').onchange = render;

// Achsenintervall merken
try {
  $('axisStep').value = localStorage.getItem('weight-axis-step') || '2';
} catch {
  $('axisStep').value = '2';
}

$('axisStep').addEventListener('change', () => {
  try {
    localStorage.setItem('weight-axis-step', $('axisStep').value);
  } catch {
    // Die App funktioniert auch ohne gespeicherte Diagrammeinstellung.
  }

  render();
});

// Alle Daten löschen
$('clearBtn').onclick = () => {
  if (!confirm(
    'Wirklich alle Messungen und das Zielgewicht löschen? ' +
    'Dieser Schritt kann nicht rückgängig gemacht werden. ' +
    'Exportiere vorher bei Bedarf ein Backup.'
  )) return;

  records = [];
  goal = null;

  try {
    saveData(records, goal);
  } catch (error) {
    alert('Die Daten konnten nicht gespeichert werden: ' + error.message);
  }

  render();
  $('entryWeight').value = '';
  $('entryNote').value = '';
};

// Ziel bearbeiten
$('editGoal').onclick = () => {
  $('goalInput').focus();
  $('goalInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

$('saveGoal').onclick = () => {
  const value = parseFloat($('goalInput').value.replace(',', '.'));

  if (!Number.isFinite(value) || value <= 0) {
    alert('Bitte ein gültiges Zielgewicht eingeben.');
    return;
  }

  goal = value;
  save();
};

// Zum Formular springen
$('jumpAdd').onclick = () => {
  $('entryWeight').focus();
  $('entryForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// Messung speichern
$('entryForm').onsubmit = event => {
  event.preventDefault();

  const weight = parseFloat($('entryWeight').value.replace(',', '.'));
  if (!Number.isFinite(weight) || weight <= 0) return;

  const date = new Date($('entryDate').value);
  if (Number.isNaN(date.getTime())) {
    alert('Bitte ein gültiges Datum und eine Uhrzeit eingeben.');
    return;
  }

  records.push({
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now() + Math.random()),
    date: date.toISOString(),
    weight,
    note: $('entryNote').value.trim()
  });

  records.sort((a, b) => new Date(a.date) - new Date(b.date));

  $('entryWeight').value = '';
  $('entryNote').value = '';

  save();
};

// JSON-Backup exportieren
$('exportBtn').onclick = () => {
  const data = createExportData(records, goal);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'gewicht-backup.json';
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$('importBtn').onclick = () => $('importFile').click();

// JSON- oder CSV-Datei importieren
$('importFile').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    let data;

    if (file.name.toLowerCase().endsWith('.csv')) {
      const lines = text.trim().split(/\r?\n/);

      const importedRecords = lines.slice(1).map(line => {
        const columns = line.split(/[;,\t]/);
        const date = new Date(columns[0]);

        if (Number.isNaN(date.getTime())) {
          throw new Error('Ungültiges Datum in der CSV-Datei: ' + columns[0]);
        }

        return {
          id: String(Math.random()),
          date: date.toISOString(),
          weight: parseFloat((columns[1] || '').replace(',', '.')),
          note: columns[2] || ''
        };
      });

      data = { records: importedRecords };
    } else {
      data = JSON.parse(text);
    }

    if (!Array.isArray(data.records)) {
      throw new Error('Datei enthält keine Messwertliste');
    }

    const incoming = data.records
      .filter(record =>
        record.date &&
        Number.isFinite(+record.weight) &&
        !Number.isNaN(new Date(record.date).getTime())
      )
      .map(record => ({
        ...record,
        id: record.id || String(Date.now() + Math.random()),
        weight: +record.weight
      }));

    if (!confirm(
      incoming.length +
      ' Messungen importieren? Bestehende Messungen bleiben erhalten.'
    )) return;

    const seen = new Set(records.map(record => record.date + '|' + record.weight));

    incoming.forEach(record => {
      const key = record.date + '|' + record.weight;

      if (!seen.has(key)) {
        records.push(record);
        seen.add(key);
      }
    });

    if (Number.isFinite(data.goal)) {
      goal = data.goal;
    }

    records.sort((a, b) => new Date(a.date) - new Date(b.date));

    save();
    alert('Import abgeschlossen.');
  } catch (error) {
    alert('Import fehlgeschlagen: ' + error.message);
  } finally {
    event.target.value = '';
  }
};

// Initialisierung
$('entryDate').value = dateInputFmt(new Date());
render();

