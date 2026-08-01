function roundQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function canonicalText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitVoiceRoomSections(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return [];
  const sections = text
    .split(/\bnext\s+room\b[\s.:,;!?-]*/i)
    .map((section) => section.trim())
    .filter(Boolean);
  return sections.length ? sections : [text];
}

export function formatVoiceRoomTranscript(transcript) {
  const sections = splitVoiceRoomSections(transcript);
  if (sections.length <= 1) return String(transcript || '').trim();
  const header = `The bracketed room-section labels below are structural instructions, not words spoken by the contractor. Return exactly ${sections.length} room objects, one for each section, in this order.`;
  return [header]
    .concat(sections.map((section, index) => `[ROOM SECTION ${index + 1} OF ${sections.length}]\n${section}`))
    .join('\n\n');
}

export function extractRoomDimensions(text) {
  const lower = String(text || '').toLowerCase();
  const dimMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?/);
  if (!dimMatch) return null;
  const length = positiveNumber(dimMatch[1]);
  const width = positiveNumber(dimMatch[2]);
  if (!length || !width) return null;
  let height = 8;
  let heightProvided = false;
  const heightMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:high|height|ceilings?|walls?)/)
    || lower.match(/(?:ceiling|wall)\s*(?:height|is|are)?\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?/);
  if (heightMatch) {
    const parsedHeight = positiveNumber(heightMatch[1]);
    if (parsedHeight) {
      height = parsedHeight;
      heightProvided = true;
    }
  }
  return {
    length,
    width,
    height,
    heightProvided,
    floorArea: roundQuantity(length * width),
    wallArea: roundQuantity((length + width) * 2 * height),
  };
}

function roomSpokenText(room) {
  return ((room && room.items) || [])
    .map((item) => item && item.spokenPhrase)
    .filter(Boolean)
    .join(' ');
}

function roomSectionHint(room) {
  const direct = Number(room && (room.sourceSection || room.sourceOrder));
  if (Number.isInteger(direct) && direct > 0) return direct - 1;
  const itemHint = ((room && room.items) || [])
    .map((item) => Number(item && item.sourceSection))
    .find((value) => Number.isInteger(value) && value > 0);
  return itemHint ? itemHint - 1 : -1;
}

function findMatchingSection(room, sections) {
  const hinted = roomSectionHint(room);
  if (hinted >= 0 && hinted < sections.length) return hinted;

  const phrases = ((room && room.items) || [])
    .map((item) => canonicalText(item && item.spokenPhrase))
    .filter((phrase) => phrase.length >= 5);
  for (const phrase of phrases) {
    const matches = sections.reduce((indexes, section, index) => {
      if (canonicalText(section).includes(phrase)) indexes.push(index);
      return indexes;
    }, []);
    if (matches.length === 1) return matches[0];
  }

  const roomName = canonicalText(room && room.name);
  if (roomName) {
    const matches = sections.reduce((indexes, section, index) => {
      if (canonicalText(section).includes(roomName)) indexes.push(index);
      return indexes;
    }, []);
    if (matches.length === 1) return matches[0];
  }
  return -1;
}

function rawRoomStart(room, transcript) {
  const lower = String(transcript || '').toLowerCase();
  if (!lower) return -1;
  const roomName = String((room && room.name) || '').trim().toLowerCase();
  const nameCandidates = [];
  if (roomName) {
    nameCandidates.push(roomName);
    roomName.split(/\s*(?:\/|&|\band\b)\s*/).filter(Boolean).forEach((part) => nameCandidates.push(part));
  }
  const nameIndexes = nameCandidates
    .map((candidate) => lower.indexOf(candidate))
    .filter((index) => index >= 0);
  if (nameIndexes.length) return Math.min(...nameIndexes);
  const phraseIndexes = ((room && room.items) || [])
    .map((item) => String((item && item.spokenPhrase) || '').trim().toLowerCase())
    .filter(Boolean)
    .map((phrase) => lower.indexOf(phrase))
    .filter((index) => index >= 0);
  return phraseIndexes.length ? Math.min(...phraseIndexes) : -1;
}

function orderedRoomContexts(rooms, transcript) {
  const sections = splitVoiceRoomSections(transcript);
  if (sections.length > 1) {
    const contexts = rooms.map((room, originalIndex) => ({
      room,
      originalIndex,
      sectionIndex: findMatchingSection(room, sections),
    }));
    if (rooms.length === sections.length) {
      contexts.forEach((context) => {
        if (context.sectionIndex < 0) context.sectionIndex = context.originalIndex;
      });
    }
    contexts.sort((a, b) => {
      const aOrder = a.sectionIndex >= 0 ? a.sectionIndex : Number.MAX_SAFE_INTEGER;
      const bOrder = b.sectionIndex >= 0 ? b.sectionIndex : Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.originalIndex - b.originalIndex;
    });
    contexts.forEach((context) => {
      context.sourceText = context.sectionIndex >= 0 ? sections[context.sectionIndex] : roomSpokenText(context.room);
    });
    return contexts;
  }

  const contexts = rooms.map((room, originalIndex) => ({
    room,
    originalIndex,
    sourceOrder: Number(room && room.sourceOrder),
    start: rawRoomStart(room, transcript),
  }));
  contexts.sort((a, b) => {
    const aHasOrder = Number.isInteger(a.sourceOrder) && a.sourceOrder > 0;
    const bHasOrder = Number.isInteger(b.sourceOrder) && b.sourceOrder > 0;
    if (aHasOrder || bHasOrder) {
      if (!aHasOrder) return 1;
      if (!bHasOrder) return -1;
      if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
    }
    const aStart = a.start >= 0 ? a.start : Number.MAX_SAFE_INTEGER;
    const bStart = b.start >= 0 ? b.start : Number.MAX_SAFE_INTEGER;
    return aStart - bStart || a.originalIndex - b.originalIndex;
  });
  contexts.forEach((context, index) => {
    if (context.start < 0) {
      context.sourceText = rooms.length === 1 ? String(transcript || '') : roomSpokenText(context.room);
      return;
    }
    const laterStarts = contexts.slice(index + 1).map((entry) => entry.start).filter((start) => start > context.start);
    const end = laterStarts.length ? Math.min(...laterStarts) : String(transcript || '').length;
    context.sourceText = String(transcript || '').slice(context.start, end);
  });
  return contexts;
}

function isPaintItem(item) {
  const label = `${(item && item.category) || ''} ${(item && item.description) || ''} ${(item && item.spokenPhrase) || ''}`.toLowerCase();
  return label.includes('paint') || label.includes('painting');
}

function normalizeRoomPaint(room, sourceText) {
  if (!room || !Array.isArray(room.items)) return room;
  const extracted = extractRoomDimensions(sourceText);
  const existing = room.dimensions || {};
  const length = (extracted && extracted.length) || positiveNumber(existing.length);
  const width = (extracted && extracted.width) || positiveNumber(existing.width);
  const existingHeightProvided = existing.heightProvided === true && !!positiveNumber(existing.height);
  const heightProvided = !!(extracted && extracted.heightProvided) || existingHeightProvided;
  const height = (extracted && extracted.heightProvided && extracted.height)
    || (existingHeightProvided && positiveNumber(existing.height))
    || 8;

  room.dimensions = {
    length: length || undefined,
    width: width || undefined,
    height,
    heightProvided,
    floorArea: length && width ? roundQuantity(length * width) : undefined,
    wallArea: length && width ? roundQuantity((length + width) * 2 * height) : undefined,
  };

  room.items.forEach((item) => {
    if (!isPaintItem(item)) return;
    const label = `${item.category || ''} ${item.description || ''} ${item.spokenPhrase || ''}`.toLowerCase();
    if (label.includes('wall')) {
      if (!length || !width) {
        item.needsMeasurement = 'room_dimensions';
        return;
      }
      item.quantity = room.dimensions.wallArea;
      item.unit = item.unit || 'sqft';
      item.calculation = `Wall paint sqft = perimeter x height = (${length}+${width})x2x${height} = ${room.dimensions.wallArea} sqft`;
      item.needsMeasurement = heightProvided ? undefined : 'ceiling_height';
      item.total = roundQuantity((parseFloat(item.rate) || 0) * room.dimensions.wallArea);
    } else if (label.includes('ceiling')) {
      if (!length || !width) {
        item.needsMeasurement = 'room_dimensions';
        return;
      }
      item.quantity = room.dimensions.floorArea;
      item.unit = item.unit || 'sqft';
      item.calculation = `Ceiling paint sqft = length x width = ${length}x${width} = ${room.dimensions.floorArea} sqft`;
      item.needsMeasurement = undefined;
      item.total = roundQuantity((parseFloat(item.rate) || 0) * room.dimensions.floorArea);
    }
  });
  return room;
}

export function normalizePaintQuantities(parsed, transcript) {
  if (!parsed || !Array.isArray(parsed.rooms)) return parsed;
  const contexts = orderedRoomContexts(parsed.rooms, transcript);
  parsed.rooms = contexts.map((context, index) => {
    const room = normalizeRoomPaint(context.room, context.sourceText);
    if (room && (!Number.isInteger(Number(room.sourceOrder)) || Number(room.sourceOrder) <= 0)) {
      room.sourceOrder = index + 1;
    }
    return room;
  });
  return parsed;
}
