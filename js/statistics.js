
export function uniqueDays(records) {
  return new Set(
    records.map(record => new Date(record.date).toISOString().slice(0, 10))
  ).size;
}

export function average(records) {
  return records.length
    ? records.reduce((sum, record) => sum + record.weight, 0) / records.length
    : NaN;
}

export function linearTrend(records) {
  if (records.length < 5) return null;

  const t0 = new Date(records[0].date).getTime();
  const end = new Date(records[records.length - 1].date).getTime();

  if ((end - t0) / 86400000 < 14) return null;

  const xs = records.map(
    record => (new Date(record.date).getTime() - t0) / 86400000
  );
  const ys = records.map(record => record.weight);
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = average(records);

  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (!denominator) return null;

  const slope = xs.reduce(
    (sum, x, i) => sum + (x - meanX) * (ys[i] - meanY),
    0
  ) / denominator;

  return {
    slope,
    intercept: meanY - slope * meanX,
    t0,
    predict(day) {
      return this.intercept + this.slope * day;
    }
  };
}

export function trendDelta(records) {
  if (records.length < 5) return NaN;

  const trend = linearTrend(records);
  if (!trend) return NaN;

  const firstDay =
    (new Date(records[0].date).getTime() - trend.t0) / 86400000;
  const lastDay =
    (new Date(records[records.length - 1].date).getTime() - trend.t0) / 86400000;

  return trend.predict(lastDay) - trend.predict(firstDay);
}

export function getGoalDirection(records, target) {
  if (target === null || !records.length) return null;

  const start = records[0].weight;
  if (Math.abs(start - target) >= 0.05) {
    return start > target ? 'loss' : 'gain';
  }

  const latest = records[records.length - 1].weight;
  if (Math.abs(latest - target) >= 0.05) {
    return latest > target ? 'loss' : 'gain';
  }

  return 'neutral';
}

export function getGoalProgress(records, target, direction) {
  if (!records.length || target === null) return 0;

  const start = records[0].weight;
  const latest = records[records.length - 1].weight;

  if (Math.abs(start - target) < 0.05) {
    return Math.abs(latest - target) < 0.05 ? 100 : 0;
  }

  let progress = 0;

  if (direction === 'loss') {
    progress = (start - latest) / (start - target) * 100;
  } else if (direction === 'gain') {
    progress = (latest - start) / (target - start) * 100;
  } else {
    progress = Math.abs(latest - target) < 0.05 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, progress));
}

export function getGoalStatus(records, target, direction, formatWeight) {
  if (!records.length) return 'Noch keine Messung';

  const current = records[records.length - 1].weight;
  const diff = current - target;
  const tolerance = 0.05;

  if (direction === 'loss') {
    if (current <= target + tolerance) {
      if (Math.abs(diff) < tolerance) return 'Ziel erreicht';
      return 'Ziel erreicht · ' + formatWeight(target - current) + ' unter dem Ziel';
    }

    return 'Noch ' + formatWeight(current - target) + ' bis zum Ziel';
  }

  if (direction === 'gain') {
    if (current >= target - tolerance) {
      if (Math.abs(diff) < tolerance) return 'Ziel erreicht';
      return 'Ziel erreicht · ' + formatWeight(current - target) + ' über dem Ziel';
    }

    return 'Noch ' + formatWeight(target - current) + ' bis zum Ziel';
  }

  if (Math.abs(diff) < tolerance) return 'Ziel erreicht';

  return diff < 0
    ? 'Aktuell ' + formatWeight(Math.abs(diff)) + ' unter dem Ziel'
    : 'Aktuell ' + formatWeight(diff) + ' über dem Ziel';
}

