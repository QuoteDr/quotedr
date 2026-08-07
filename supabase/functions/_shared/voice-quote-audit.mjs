const NUMBER_WORDS = Object.freeze({
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
});

const ACTION_WORDS = new Set([
  'add', 'build', 'case', 'clean', 'coat', 'connect', 'demolish', 'demo', 'disconnect',
  'dispose', 'drywall', 'finish', 'frame', 'hang', 'install', 'move', 'paint', 'patch',
  'plumb', 'prime', 'remove', 'repair', 'replace', 'sand', 'seal', 'stain', 'tile',
  'trim', 'upgrade', 'wire',
]);

const COUNTABLE_OBJECTS = new Set([
  'appliance', 'baluster', 'beam', 'cabinet', 'ceiling', 'closet', 'column', 'countertop',
  'door', 'drawer', 'fan', 'faucet', 'fence', 'fixture', 'gate', 'joist', 'light', 'outlet',
  'panel', 'post', 'receptacle', 'register', 'riser', 'room', 'shelf', 'sheet', 'shower',
  'sink', 'stair', 'step', 'stud', 'switch', 'toilet', 'tread', 'tub', 'vanity', 'vent',
  'wall', 'window',
]);

const MEASUREMENT_UNITS = new Set([
  'centimeter', 'cm', 'feet', 'foot', 'ft', 'in', 'inch', 'inches', 'lf', 'meter', 'metre', 'mm', 'sf', 'sqft',
]);

const QUALIFIERS = new Set([
  'exterior', 'interior', 'inside', 'outside', 'painted', 'stained', 'cedar', 'oak',
  'vinyl', 'aluminum', 'aluminium', 'steel', 'wood', 'wooden', 'composite',
]);

function singularize(value) {
  const token = String(value || '').toLowerCase();
  if (token.length > 3 && /ies$/.test(token)) return token.slice(0, -3) + 'y';
  if (token.length > 3 && /s$/.test(token) && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

function numberValue(value) {
  const token = String(value || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, token)) return NUMBER_WORDS[token];
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokenize(value) {
  const source = String(value || '');
  const tokens = [];
  const matcher = /[a-z0-9]+(?:\.[0-9]+)?/gi;
  let match;
  while ((match = matcher.exec(source))) {
    const raw = match[0];
    tokens.push({
      raw,
      value: singularize(raw),
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tokens;
}

function normalizedText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function quoteItems(result) {
  const flattened = [];
  for (const [roomIndex, room] of (Array.isArray(result?.rooms) ? result.rooms : []).entries()) {
    for (const [itemIndex, item] of (Array.isArray(room?.items) ? room.items : []).entries()) {
      if (item && typeof item === 'object') flattened.push({ roomIndex, itemIndex, room, item });
    }
  }
  return flattened;
}

function itemOutputText(item) {
  return [item?.description, item?.serviceName, item?.category, item?.calculation, item?.unit, item?.unitType]
    .filter(Boolean)
    .join(' ');
}

function hasToken(value, expected) {
  const target = singularize(expected);
  return tokenize(value).some((token) => token.value === target);
}

function hasNumber(value, expected) {
  return tokenize(value).some((token) => {
    const parsed = numberValue(token.raw);
    return parsed !== null && Math.abs(parsed - expected) < 0.001;
  });
}

function splitActionClauses(transcript) {
  return String(transcript || '')
    .replace(/\bnext\s+room\b/gi, '.')
    .split(/[.!?;\n]+|\b(?:and|then)\b(?=\s+(?:add|build|case|clean|coat|connect|demolish|demo|disconnect|dispose|drywall|finish|frame|hang|install|move|paint|patch|plumb|prime|remove|repair|replace|sand|seal|stain|tile|trim|upgrade|wire)\b)/gi)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

export function extractVoiceWorkClaims(transcript) {
  const claims = [];
  for (const clause of splitActionClauses(transcript)) {
    if (/\b(?:do not|don't|dont|exclude|excluding|skip)\b/i.test(clause)) continue;
    const tokens = tokenize(clause);
    const actionIndexes = tokens
      .map((token, index) => ACTION_WORDS.has(token.value) ? index : -1)
      .filter((index) => index >= 0);
    if (!actionIndexes.length) continue;
    const firstAction = actionIndexes[0];
    const beforeAction = tokens.slice(Math.max(0, firstAction - 3), firstAction).map((token) => token.value);
    if (beforeAction.some((token) => token === 'not' || token === 'dont' || token === 'exclude' || token === 'excluding')) continue;
    const actions = [...new Set(actionIndexes.map((index) => tokens[index].value))];
    const objects = [...new Set(tokens.slice(firstAction + 1)
      .map((token) => token.value)
      .filter((token) => COUNTABLE_OBJECTS.has(token)))];
    for (const object of objects) claims.push({ clause, actions, object });
  }
  return claims;
}

export function extractVoiceCountClaims(transcript) {
  const source = String(transcript || '');
  const tokens = tokenize(source);
  const claims = [];
  const seen = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const count = numberValue(tokens[index].raw);
    if (count === null || count <= 0) continue;
    const previous = tokens[index - 1]?.value || '';
    const next = tokens[index + 1]?.value || '';
    if (previous === 'x' || previous === 'by' || next === 'x' || next === 'by') continue;
    if (tokens[index + 1] && MEASUREMENT_UNITS.has(tokens[index + 1].value)) continue;
    for (let objectIndex = index + 1; objectIndex <= Math.min(tokens.length - 1, index + 4); objectIndex += 1) {
      const between = tokens.slice(index + 1, objectIndex).map((token) => token.value);
      if (between.some((token) => MEASUREMENT_UNITS.has(token) || numberValue(token) !== null)) break;
      const object = tokens[objectIndex].value;
      if (!COUNTABLE_OBJECTS.has(object)) continue;
      const qualifiers = between.filter((token) => QUALIFIERS.has(token));
      const key = `${count}|${object}|${tokens[index].start}`;
      if (!seen.has(key)) {
        seen.add(key);
        claims.push({
          count,
          object,
          qualifiers,
          spokenPhrase: source.slice(tokens[index].start, tokens[objectIndex].end),
        });
      }
      break;
    }
  }
  return claims;
}

export function extractVoiceQualifierClaims(transcript) {
  const source = String(transcript || '');
  const tokens = tokenize(source);
  const claims = [];
  const seen = new Set();
  for (let qualifierIndex = 0; qualifierIndex < tokens.length; qualifierIndex += 1) {
    const qualifier = tokens[qualifierIndex].value;
    if (!QUALIFIERS.has(qualifier)) continue;
    for (let objectIndex = qualifierIndex + 1; objectIndex <= Math.min(tokens.length - 1, qualifierIndex + 4); objectIndex += 1) {
      const object = tokens[objectIndex].value;
      if (!COUNTABLE_OBJECTS.has(object)) continue;
      const key = `${qualifier}|${object}|${tokens[qualifierIndex].start}`;
      if (!seen.has(key)) {
        seen.add(key);
        claims.push({
          qualifier,
          object,
          spokenPhrase: source.slice(tokens[qualifierIndex].start, tokens[objectIndex].end),
        });
      }
      break;
    }
  }
  return claims;
}

export function buildVoiceQuoteAuditClaims(transcript) {
  return {
    work: extractVoiceWorkClaims(transcript).map((claim) => ({
      actions: claim.actions,
      object: claim.object,
    })),
    counts: extractVoiceCountClaims(transcript).map((claim) => ({
      count: claim.count,
      object: claim.object,
    })),
    qualifiers: extractVoiceQualifierClaims(transcript).map((claim) => ({
      qualifier: claim.qualifier,
      object: claim.object,
    })),
  };
}

function phraseIsInTranscript(phrase, transcript) {
  const needle = normalizedText(phrase);
  return !!needle && normalizedText(transcript).includes(needle);
}

function itemCoversWorkClaim(entry, claim, transcript) {
  const phrase = String(entry.item?.spokenPhrase || '');
  if (!phraseIsInTranscript(phrase, transcript) || !hasToken(phrase, claim.object)) return false;
  const combined = `${phrase} ${itemOutputText(entry.item)}`;
  return claim.actions.some((action) => hasToken(combined, action));
}

function itemCoversCountClaim(entry, claim, transcript) {
  const item = entry.item || {};
  const phrase = String(item.spokenPhrase || '');
  if (!phraseIsInTranscript(phrase, transcript) || !hasToken(phrase, claim.object) || !hasNumber(phrase, claim.count)) return false;
  const quantity = Number(item.quantity);
  const calculation = String(item.calculation || '');
  const description = `${item.description || ''} ${item.serviceName || ''}`;
  return (Number.isFinite(quantity) && Math.abs(quantity - claim.count) < 0.001)
    || (hasToken(calculation, claim.object) && hasNumber(calculation, claim.count))
    || (hasToken(description, claim.object) && hasNumber(description, claim.count));
}

export function findVoiceQuoteAuditIssues(result, transcript) {
  const issues = [];
  const items = quoteItems(result);
  if (!Array.isArray(result?.rooms)) {
    return [{ code: 'invalid_quote_shape', severity: 'critical' }];
  }

  const workClaims = extractVoiceWorkClaims(transcript);
  if (workClaims.length && !items.length) issues.push({ code: 'no_items_for_spoken_work', severity: 'critical' });

  for (const entry of items) {
    const phrase = String(entry.item?.spokenPhrase || '').trim();
    if (!phrase) {
      issues.push({ code: 'missing_spoken_phrase', severity: 'critical', roomIndex: entry.roomIndex, itemIndex: entry.itemIndex });
    } else if (!phraseIsInTranscript(phrase, transcript)) {
      issues.push({ code: 'non_verbatim_spoken_phrase', severity: 'critical', roomIndex: entry.roomIndex, itemIndex: entry.itemIndex });
    }
  }

  workClaims.forEach((claim, claimIndex) => {
    if (!items.some((entry) => itemCoversWorkClaim(entry, claim, transcript))) {
      issues.push({ code: 'missing_spoken_work', severity: 'critical', claimIndex });
    }
  });

  extractVoiceCountClaims(transcript).forEach((claim, claimIndex) => {
    const covering = items.filter((entry) => {
      const phrase = String(entry.item?.spokenPhrase || '');
      return phraseIsInTranscript(phrase, transcript) && hasToken(phrase, claim.object) && hasNumber(phrase, claim.count);
    });
    const aggregateQuantity = covering.reduce((total, entry) => {
      const quantity = Number(entry.item?.quantity);
      return total + (Number.isFinite(quantity) ? quantity : 0);
    }, 0);
    if (!covering.some((entry) => itemCoversCountClaim(entry, claim, transcript))
        && Math.abs(aggregateQuantity - claim.count) >= 0.001) {
      issues.push({ code: 'spoken_count_not_applied', severity: 'critical', claimIndex });
    }
  });

  extractVoiceQualifierClaims(transcript).forEach((claim, claimIndex) => {
    const covering = items.filter((entry) => {
      const phrase = String(entry.item?.spokenPhrase || '');
      return phraseIsInTranscript(phrase, transcript)
        && hasToken(phrase, claim.object)
        && hasToken(phrase, claim.qualifier);
    });
    if (!covering.some((entry) => hasToken(itemOutputText(entry.item), claim.qualifier))) {
      issues.push({ code: 'spoken_qualifier_not_reflected', severity: 'critical', claimIndex });
    }
  });

  return issues;
}

export function criticalVoiceQuoteAuditIssues(result, transcript) {
  return findVoiceQuoteAuditIssues(result, transcript).filter((issue) => issue.severity === 'critical');
}
