// Shared deterministic retrieval. No network, credentials or user data storage.
const stop = new Set('i a an the is it can do how to my me you we of in on at and or for with this that have all them'.split(' '));
export function tokens(value) {
  return [...new Set((String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []).map(w => w.replace(/s$/, '')).filter(w => w.length > 1 && !stop.has(w)))];
}
export function validHandbook(book) {
  return book?.schemaVersion === 1 && typeof book.version === 'string' && book.version.length < 80 &&
    Array.isArray(book.articles) && book.articles.length > 0 && book.articles.length <= 100 &&
    new Set(book.articles.map(a => a.id)).size === book.articles.length && book.articles.every(a =>
      /^[a-z0-9-]{1,100}$/.test(a.id) && typeof a.title === 'string' && a.title.length < 160 &&
      typeof a.body === 'string' && a.body.length < 10000 && /^\d{4}-\d{2}-\d{2}$/.test(a.verifiedAt) && typeof a.release === 'string');
}
export function searchHandbook(book, question, previous = '') {
  if (!validHandbook(book)) return [];
  const current = tokens(question), history = tokens(previous);
  const score = (a, words) => { const title = tokens(a.title), body = tokens(a.body); return words.reduce((n,w) => n + (title.includes(w) ? 5 : body.includes(w) ? 1 : 0), 0); };
  return book.articles.map(a => ({a, score: score(a,current) + (current.length < 4 ? score(a,history)*0.5 : 0)}))
    .filter(x => x.score >= 2).sort((a,b) => b.score-a.score).slice(0,4).map(x => x.a);
}
