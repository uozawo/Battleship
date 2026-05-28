// Глушить ЛИШЕ ExperimentalWarning від вбудованого node:sqlite.
// Імпортується ПЕРШИМ у db.js — ESM гарантує, що цей код виконається
// до завантаження модуля node:sqlite, тож попередження не зʼявиться.
// Усі інші попередження проходять як зазвичай.
const original = process.emitWarning.bind(process);

process.emitWarning = (warning, ...args) => {
  const message = typeof warning === 'string' ? warning : warning?.message || '';
  // Заглушуємо за текстом — незалежно від форми виклику (рядок чи обʼєкт-попередження).
  if (message.includes('SQLite is an experimental')) return;
  return original(warning, ...args);
};
