// Fuzzy search over short names (the command palette, the shortcuts dialog):
// what was typed against a name and its other words, ignoring case, accents
// and the order of the words. Pure.
//
// Each word typed has to be found, in the name or in one of the other words:
// at the start of a word (best), inside one, or as its letters in order
// starting at the start of a word («dpl» finds «Duplicar»). The name counts
// more than the other words, the whole query at the start of the name more
// still, and a shorter name wins a tie.

// Marks too: Devanagari vowel signs are inside a word, not between words.
const WORD = /[\p{L}\p{M}\p{N}]/u;
const SPACE = /\s/;

/** The text in lowercase, without accents, with any space as « »: one character per character, so indices stay valid. */
export function fold(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c < '\u0080') out += c.toLowerCase();
    else if (SPACE.test(c)) out += ' ';
    else out += c.normalize('NFD')[0].toLowerCase()[0];
  }
  return out;
}

/** A name and its other words (a comma-separated list), folded once for many searches. */
export function prepare(name, aliases = '') {
  return {
    name,
    key: fold(name),
    alt: aliases
      .split(',')
      .map((alias) => fold(alias.trim()))
      .filter(Boolean),
  };
}

const wordStart = (text, i) => i === 0 || !WORD.test(text[i - 1]);

// What each way of finding a word is worth.
const AT_WORD_START = 100;
const INSIDE_WORD = 60;
const IN_ORDER = 20;
const IN_ALIASES = 0.5;
const QUERY_STARTS_NAME = 50;
const QUERY_IN_NAME = 20;

/** The best place of `token` in `text` (both folded): {score, indices}, or null. */
function findToken(token, text) {
  let inside = -1;
  for (let i = text.indexOf(token); i >= 0; i = text.indexOf(token, i + 1)) {
    if (wordStart(text, i)) return { score: AT_WORD_START + token.length, from: i, to: i + token.length, indices: null };
    if (inside < 0) inside = i;
  }
  if (inside >= 0) return { score: INSIDE_WORD + token.length, from: inside, to: inside + token.length, indices: null };
  if (token.length < 2) return null;
  // Its letters in order from the start of a word, going on to another word
  // only at its start («rad»: Rotar a la derecha): the tightest such run.
  let best = null;
  for (let start = text.indexOf(token[0]); start >= 0; start = text.indexOf(token[0], start + 1)) {
    if (!wordStart(text, start)) continue;
    const indices = [start];
    let crossed = false;
    for (let j = start + 1; j < text.length && indices.length < token.length; j++) {
      if (!WORD.test(text[j])) crossed = true;
      else if (text[j] === token[indices.length] && (!crossed || wordStart(text, j))) {
        indices.push(j);
        crossed = false;
      }
    }
    if (indices.length < token.length) continue;
    const span = indices.at(-1) - start + 1;
    const score = IN_ORDER + (token.length / span) * IN_ORDER;
    if (!best || score > best.score) best = { score, indices };
  }
  return best;
}

/** Sorted, merged [start, end) pairs from single indices and runs. */
function toRanges(found) {
  const marks = [];
  for (const f of found) {
    if (f.indices) for (const i of f.indices) marks.push([i, i + 1]);
    else marks.push([f.from, f.to]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  const ranges = [];
  for (const [from, to] of marks) {
    const last = ranges.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
  }
  return ranges;
}

/**
 * How well `query` finds `target` (from prepare): null if some word of the
 * query is in neither its name nor its other words; otherwise a score
 * (higher is better) and the parts of the name it matched, as [start, end)
 * pairs. An empty query finds everything, with score 0.
 */
export function fuzzyMatch(query, target) {
  const q = fold(query).trim().replace(/ +/g, ' ');
  if (!q) return { score: 0, ranges: [] };
  let score = 0;
  const inName = [];
  for (const token of q.split(' ')) {
    const found = findToken(token, target.key);
    let alias = null;
    for (const text of target.alt) {
      const match = findToken(token, text);
      if (match && (!alias || match.score > alias.score)) alias = match;
    }
    if (found && (!alias || found.score >= alias.score * IN_ALIASES)) {
      score += found.score;
      inName.push(found);
    } else if (alias) score += alias.score * IN_ALIASES;
    else return null;
  }
  const whole = target.key.indexOf(q);
  if (whole === 0) score += QUERY_STARTS_NAME;
  else if (whole > 0) score += QUERY_IN_NAME;
  // Several words found together are marked as one run, with what's between them.
  if (whole >= 0) inName.push({ from: whole, to: whole + q.length, indices: null });
  // A tie goes to the shorter name.
  score -= target.key.length / 1000;
  return { score, ranges: toRanges(inName) };
}

/**
 * The targets `query` finds, best first (a tie keeps their order), each with
 * its index in `targets`, its score and the matched parts of its name.
 */
export function fuzzyFilter(query, targets) {
  const results = [];
  targets.forEach((target, index) => {
    const match = fuzzyMatch(query, target);
    if (match) results.push({ index, ...match });
  });
  return results.sort((a, b) => b.score - a.score || a.index - b.index);
}
