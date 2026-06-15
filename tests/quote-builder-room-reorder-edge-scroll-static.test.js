const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('function handleQuoteBuilderRoomReorderPointerMove'), 'room reorder modal should track pointer movement during drag');
assert(source.includes('function updateQuoteBuilderRoomReorderEdgeScroll'), 'room reorder modal should update edge-scroll from pointer position');
assert(source.includes('function startQuoteBuilderRoomReorderEdgeScroll'), 'room reorder modal should start a custom edge-scroll loop');
assert(source.includes('function stopQuoteBuilderRoomReorderEdgeScroll'), 'room reorder modal should stop the custom edge-scroll loop');
assert(source.includes('window._quoteBuilderRoomReorderDragging'), 'room reorder modal should track active drag state');
assert(source.includes('window._quoteBuilderRoomReorderEdgeScrollTimer'), 'room reorder modal should store the edge-scroll timer');
assert(source.includes('window._quoteBuilderRoomReorderEdgeScrollStartedAt'), 'edge-scroll should remember when the current drag-scroll started');
assert(source.includes("window.addEventListener('mousemove', handleQuoteBuilderRoomReorderPointerMove"), 'drag start should listen for mouse movement globally');
assert(source.includes("window.addEventListener('touchmove', handleQuoteBuilderRoomReorderPointerMove"), 'drag start should listen for touch movement globally');
assert(source.includes("window.removeEventListener('mousemove', handleQuoteBuilderRoomReorderPointerMove"), 'drag end should remove mouse movement listener');
assert(source.includes("window.removeEventListener('touchmove', handleQuoteBuilderRoomReorderPointerMove"), 'drag end should remove touch movement listener');
assert(source.includes('list.getBoundingClientRect()'), 'edge-scroll should use the visible list bounds');
assert(source.includes('list.scrollTop += scrollDelta'), 'edge-scroll should scroll the compact list directly');
assert(source.includes('var rampDurationMs = 2000'), 'edge-scroll should use a longer but still quick ramp');
assert(source.includes('var maxSpeed = 28'), 'edge-scroll should keep the tested fast maximum speed');
assert(source.includes('var rampStartSpeed = 0.35'), 'edge-scroll should start at a reduced portion of full speed');
assert(source.includes('var rampProgress = Math.min(1'), 'edge-scroll should cap the speed ramp at full speed');
assert(source.includes('var rampMultiplier = rampStartSpeed + ((1 - rampStartSpeed) * rampProgress)'), 'edge-scroll should use a ramped multiplier');
assert(source.includes('var edgeProgress = 0'), 'edge-scroll should calculate proximity to the top or bottom edge');
assert(source.includes('var easedEdgeProgress = Math.pow(edgeProgress, 2)'), 'edge-scroll should ease speed based on how close the held room is to the edge');
assert(source.includes('Math.max(1, Math.ceil(easedEdgeProgress * maxSpeed * rampMultiplier))'), 'edge-scroll should move slowly near the edge zone and quickly at the edge');
assert(!source.includes('* currentSpeed'), 'edge-scroll should not use the old linear speed calculation');

assert(
  /Sortable\.create\(list,\s*\{[\s\S]*handle:\s*['"]\.quote-builder-room-reorder-handle['"][\s\S]*onStart:\s*function\(evt\)[\s\S]*startQuoteBuilderRoomReorderEdgeScroll\(\)[\s\S]*onMove:\s*function\(evt\)[\s\S]*updateQuoteBuilderRoomReorderEdgeScroll[\s\S]*onEnd:\s*function\(\)[\s\S]*stopQuoteBuilderRoomReorderEdgeScroll\(\)/.test(source),
  'room reorder Sortable should run edge-scroll only during active drag'
);
assert(!source.includes('handleQuoteBuilderRoomReorderWheel'), 'mouse wheel experiment should remain removed');
assert(!source.includes('_quoteBuilderRoomReorderHolding'), 'click-hold wheel experiment should remain removed');

console.log('quote builder room reorder edge-scroll static test passed');
