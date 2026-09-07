export const MAX_DESIGN_BYTES = 8 * 1024 * 1024;
export const DESIGN_MIME = Object.freeze({ image:['image/png','image/jpeg','image/webp'], pdf:['application/pdf'], interactive:['text/html'] });
export function designInput(input) {
  const kind = String(input.kind || '');
  if (!['link', ...Object.keys(DESIGN_MIME)].includes(kind)) throw new Error('Unsupported design format');
  const title = String(input.title || '').trim();
  if (!title || title.length > 160) throw new Error('Enter a design title (up to 160 characters).');
  const out = { title, kind, project:String(input.project || 'Project designs').trim().slice(0,160) || 'Project designs', note:String(input.note || '').slice(0,2000), version:String(input.version || '1').slice(0,40), external_url:'', mime_type:'', size_bytes:0 };
  if (kind === 'link') {
    let url; try { url = new URL(input.url); } catch { throw new Error('Enter a full HTTPS design link.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 4000) throw new Error('Use an HTTPS link without embedded passwords.');
    out.external_url = url.href;
  } else {
    if (!DESIGN_MIME[kind].includes(input.mime)) throw new Error('Unsupported file type. Use PNG, JPEG, WebP, PDF, or self-contained HTML.');
    if (!Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_DESIGN_BYTES) throw new Error('Design files must be between 1 byte and 8 MB.');
    out.mime_type = input.mime;
    out.size_bytes = input.size;
  }
  return out;
}
