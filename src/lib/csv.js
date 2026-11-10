// Parser CSV mínimo (RFC 4180): comillas dobles, comas y saltos de línea dentro de campos.
// Se usa tanto en el navegador como en scripts/validate.mjs (Node), así que no importa nada.

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      record.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  const [header = [], ...body] = nonEmpty;
  const columns = header.map((h) => h.trim());
  const rows = body.map((r, idx) => {
    const obj = {};
    columns.forEach((col, j) => {
      obj[col] = (r[j] ?? '').trim();
    });
    Object.defineProperty(obj, '__line', { value: idx + 2, enumerable: false });
    Object.defineProperty(obj, '__width', { value: r.length, enumerable: false });
    return obj;
  });
  return { columns, rows };
}

/** Convierte un campo a número. Devuelve NaN si está vacío o no es un número. */
export function num(value) {
  if (value === undefined || value === null) return NaN;
  const s = String(value).trim();
  if (s === '') return NaN;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}
