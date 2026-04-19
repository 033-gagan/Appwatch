function isoDateKey(d) {
  const date = d || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeDateKey(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
  };

  const namedMatch = str.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (namedMatch) {
    const month = months[namedMatch[1]];
    const day = parseInt(namedMatch[2], 10);
    const year = parseInt(namedMatch[3], 10);
    if (month !== undefined && !Number.isNaN(day) && !Number.isNaN(year)) {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const first = parseInt(slashMatch[1], 10);
    const second = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);

    let month = first - 1;
    let day = second;
    if (first > 12) {
      month = second - 1;
      day = first;
    } else if (second > 12) {
      month = first - 1;
      day = second;
    }

    if (!Number.isNaN(month) && !Number.isNaN(day) && !Number.isNaN(year) && month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

function historyEntryDateKey(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (Number.isFinite(Number(entry.timestamp))) {
    return isoDateKey(new Date(Number(entry.timestamp)));
  }
  return normalizeDateKey(entry.date);
}

module.exports = {
  historyEntryDateKey,
  isoDateKey,
  normalizeDateKey
};
