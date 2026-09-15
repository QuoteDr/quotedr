const fs=require('node:fs'),assert=require('node:assert/strict');
const viewer=fs.readFileSync('interactive-quote-viewer.html','utf8');
const start=viewer.indexOf('function renderExpandableJobNote('),end=viewer.indexOf('function roomAnchorId(',start);
const build=new Function('resolveViewerDocumentStyle','formatDescriptionText',viewer.slice(start,end)+';return renderExpandableJobNote;');
const text='Long job-specific note. '.repeat(40);
function render(style,value=text){return build(()=>style,s=>s.replace(/</g,'&lt;'))(value,'job_note_2_3');}
assert(!render({}).includes('Show more'));
assert(!render({jobNotePreviewLength:0}).includes('Show more'));
assert(render({jobNotePreviewLength:120}).includes('Show more'));
assert(render({jobNotePreviewLength:120}).includes(text.trim()));
assert(!render({jobNotePreviewLength:1200}).includes('Show more'));
assert(!render({jobNotePreviewLength:20},'short').includes('Show more'));
assert(render({jobNotePreviewLength:20},'<script>'+text).includes('&lt;script>'));
const style=fs.readFileSync('quote-style.js','utf8');
assert(style.includes("setFieldValue('quoteJobNotePreviewLength', _quoteStyle.jobNotePreviewLength)"));
assert(style.includes("'quoteScopePreviewLength','quoteJobNotePreviewLength'"));
console.log('Job note preview: full legacy text, limits, full content retention, escaping and settings wiring passed');
