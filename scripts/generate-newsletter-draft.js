const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  return argv.reduce((acc, value, index) => {
    if (value === '--date' && argv[index + 1]) acc.date = argv[index + 1];
    if (value === '--limit' && argv[index + 1]) acc.limit = Number(argv[index + 1]);
    return acc;
  }, {});
}

function formatDateSlug(value) {
  return String(value || new Date().toISOString().slice(0, 10)).slice(0, 10);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'whats-new.json'), 'utf8'));
const date = formatDateSlug(args.date);
const limit = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : 4;
const entries = (data.entries || [])
  .filter((entry) => entry.newsletterEligible)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  .slice(0, limit);

if (!entries.length) {
  throw new Error('No newsletter-eligible updates found in whats-new.json');
}

const subject = 'QuoteDr weekly update: faster quoting, cleaner client flow';
const previewText = 'Recent QuoteDr updates, one practical quoting tip, and what changed this week.';
const tip = 'Detailed quotes sell better because clients can see what they are buying. QuoteDr is built to make that level of detail fast enough that you are not gambling your whole evening on one quote.';

const markdown = `# ${subject}

Preview text: ${previewText}

Hey,

Here is what changed in QuoteDr lately. I am keeping these updates practical: what got better, why it matters on a real job, and how it saves quoting time.

${entries.map((entry) => `## ${entry.title}

${entry.newsletterBlurb}

${entry.cta}`).join('\n\n')}

## Quoting tip

${tip}

Early access details: https://quotedr.io/login.html?signup=1

Feedback: support@quotedr.io

Unsubscribe: include the subscriber unsubscribe link before sending this campaign.
`;

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#24364b;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(previewText)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5eaf1;">
        <tr><td style="background:#0f3460;padding:30px 34px;">
          <div style="color:#e87e2a;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">QuoteDr weekly update</div>
          <h1 style="color:#ffffff;margin:8px 0 0;font-size:28px;line-height:1.15;">Faster quoting, cleaner client flow.</h1>
        </td></tr>
        <tr><td style="padding:30px 34px;">
          <p style="font-size:16px;line-height:1.6;margin:0 0 22px;">Hey, here is what changed in QuoteDr lately. I am keeping these updates practical: what got better, why it matters on a real job, and how it saves quoting time.</p>
          ${entries.map((entry) => `
          <div style="border-top:1px solid #e5eaf1;padding-top:20px;margin-top:20px;">
            <div style="color:#e87e2a;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(entry.category)}</div>
            <h2 style="color:#0f3460;margin:6px 0 8px;font-size:22px;">${escapeHtml(entry.title)}</h2>
            <p style="font-size:15px;line-height:1.6;margin:0 0 10px;">${escapeHtml(entry.newsletterBlurb)}</p>
            <p style="font-size:14px;line-height:1.6;margin:0;color:#526070;">${escapeHtml(entry.cta)}</p>
          </div>`).join('')}
          <div style="background:#f0f7ff;border:1px solid #d7e8fb;border-radius:10px;padding:18px;margin:26px 0;">
            <h2 style="color:#0f3460;margin:0 0 8px;font-size:20px;">Quoting tip</h2>
            <p style="font-size:15px;line-height:1.6;margin:0;">${escapeHtml(tip)}</p>
          </div>
          <p style="text-align:center;margin:26px 0;">
            <a href="https://quotedr.io/login.html?signup=1" style="display:inline-block;background:#e87e2a;color:#ffffff;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:999px;">Early Access Details</a>
          </p>
          <p style="color:#64748b;font-size:13px;line-height:1.5;margin:24px 0 0;">Feedback goes to support@quotedr.io. Unsubscribe: include the subscriber unsubscribe link before sending this campaign.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const outDir = path.join(root, 'newsletter-drafts');
fs.mkdirSync(outDir, { recursive: true });
const base = path.join(outDir, `${date}-quotedr-weekly-update`);
fs.writeFileSync(`${base}.md`, markdown);
fs.writeFileSync(`${base}.html`, html);

console.log(`Wrote ${path.relative(root, `${base}.md`)}`);
console.log(`Wrote ${path.relative(root, `${base}.html`)}`);
