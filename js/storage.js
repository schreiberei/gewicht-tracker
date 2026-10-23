
export const STORAGE_KEY = 'weight-local-v1';

export function loadData() {
  let records = [];
  let goal = null;

  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    records = Array.isArray(data.records) ? data.records : [];
    goal = Number.isFinite(data.goal) ? data.goal : null;
  } catch {
    records = [];
    goal = null;
  }

  records = records
    .filter(record => Number.isFinite(+record.weight) && record.date)
    .map(record => ({ ...record, weight: +record.weight }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return { records, goal };
}

export function saveData(records, goal) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, goal }));
}

export function createExportData(records, goal) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
    goal
  };
}

