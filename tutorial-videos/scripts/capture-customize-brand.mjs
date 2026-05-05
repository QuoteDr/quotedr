import { mkdirSync, statSync, createReadStream, existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const appRoot = resolve(projectRoot, "..");
const captureDir = resolve(projectRoot, "public", "captures", "customize-brand");
const port = 8799;

mkdirSync(captureDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

const supabaseStub = `const SUPABASE_URL=''; const SUPABASE_ANON_KEY='';
const tutorialUser={id:'tutorial-user',email:'tutorial@quotedr.io'};
function __qdChain(data){
  const c={};
  ['select','eq','order','insert','update','delete','upsert','limit','gte','lte','neq','match'].forEach(function(k){ c[k]=function(){ return c; }; });
  c.single=async function(){ return {data:data || null,error:null}; };
  c.maybeSingle=async function(){ return {data:data || null,error:null}; };
  c.then=function(resolve,reject){ return Promise.resolve({data:data || null,error:null}).then(resolve,reject); };
  return c;
}
const _supabase={
  auth:{
    getSession:async()=>({data:{session:{user:tutorialUser}},error:null}),
    getUser:async()=>({data:{user:tutorialUser},error:null}),
    signOut:async()=>({error:null})
  },
  from:function(){ return __qdChain(null); },
  storage:{ from:function(){ return { upload:async()=>({data:{path:'tutorial'},error:null}), getPublicUrl:()=>({data:{publicUrl:'ald-logo.svg'},error:null}) }; } }
};
async function checkAuthStatus(){return tutorialUser;}
async function getCurrentUser(){return tutorialUser;}
async function loadOnboardingComplete(){return true;}
async function loadLogoFromSupabase(){return 'ald-logo.svg';}
async function loadBusinessProfile(){return {business_name:'ALD Direct Inc.',tagline:'Repair Renovate Revive',phone:'905-467-6882',email:'info@alddirect.ca'};}
async function saveBusinessProfile(){return {data:null,error:null};}
async function saveLogoToSupabase(){return {data:null,error:null};}
async function loadQuoteForViewing(){return {data:null,error:'Not used in tutorial capture'};}
async function saveQuoteForSharing(){return {data:{id:'tutorial-quote'},error:null};}
function signOut(){}`;

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "landing.html";

  if (pathname.startsWith("supabase-v2.js")) {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(supabaseStub);
    return;
  }

  const file = resolve(appRoot, pathname);
  if (!file.startsWith(appRoot) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Not found: ${pathname}`);
    return;
  }

  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(file).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(file).pipe(res);
});

const quoteData = {
  version: 1,
  quoteTitle: "Bathroom Refresh",
  quoteNumber: "2026-006",
  clientName: "Adam Dezic",
  projectAddress: "2051 Prospect",
  clientPhone: "9054676882",
  clientEmail: "info@alddirect.ca",
  terms: [
    "A deposit of 30-50% of the total project cost is required before work begins. Work will not commence until the deposit is received.",
    "All labor is warranted for 1 year from the date of project completion. This warranty covers defects in workmanship only and does not cover damage caused by client misuse, third parties, or normal wear and tear.",
    "Final payment is due within 7 days of project completion. Overdue balances may be subject to a 2% monthly interest charge.",
  ],
  roomCounter: 1,
  rooms: [
    {
      id: 1,
      name: "Bathroom",
      colorIndex: 8,
      color: "#e87e2a",
      colorIntensity: 78,
      icon: "fa-door-open",
      timeline: "1-2 weeks",
      markup: 0,
      markupVisible: false,
      notes: "Bathroom refresh with pot lights, trim, drywall finish, and client-approved upgrades.",
      items: [
        {
          category: "Electrical",
          description: 'Installation of 4" slim LED recessed pot lights. Lights include 5x colour-temperature adjustment settings.',
          quantity: 2,
          unit: "each",
          rate: 150,
          total: 300,
          upgrade: true,
          upgradeName: "Night Light Mode",
          upgradePrice: 75,
        },
        {
          category: "Doors & Trim",
          description: "Supply and install a standard interior door with trim touch-ups.",
          quantity: 1,
          unit: "each",
          rate: 500,
          total: 500,
        },
        {
          category: "Drywall",
          description: "Complete drywall service including hang, mud, tape, sand, prime, and cleanup for a paint-ready finish.",
          quantity: 320,
          unit: "sq ft",
          rate: 6.4,
          total: 2048,
        },
        {
          category: "Drywall",
          description: "Turn-key drywall installation with premium finishing and a smooth, paint-ready surface.",
          quantity: 1000,
          unit: "sq ft",
          rate: 6.4,
          total: 6400,
          upgrade: true,
          upgradeName: "Ultra-Premium Level 5 Drywall Installation",
          upgradePrice: 1200,
        },
      ],
    },
  ],
};

const businessProfile = {
  business_name: "ALD Direct Inc.",
  tagline: "Repair Renovate Revive",
  phone: "905-467-6882",
  email: "info@alddirect.ca",
};

const quoteStyle = {
  preset: "warm-renovation",
  accent: "#e87e2a",
  bg: "#fff8ee",
  bgOpacity: 70,
  headerStyle: "branded",
  headerOpacity: 82,
  fontFeel: "bold",
  pricingMode: "full",
  depositMode: "show",
  depositPercent: 50,
  approvalMode: "approve_or_changes",
  expiryDate: "2026-06-02",
  showUpgrades: true,
  showScopeNotes: true,
  showCommitment: true,
  commitment: {
    title: "OUR COMMITMENT TO YOU",
    items: [
      { icon: "fa-solid fa-shield-halved", image: "", label: "1-Year Warranty", text: "Workmanship guaranteed for 12 months from project completion" },
      { icon: "fa-solid fa-house-lock", image: "", label: "Home Protected", text: "Careful prep, floor protection, and clean work areas" },
      { icon: "fa-solid fa-calendar-check", image: "", label: "Schedule Promise", text: "Clear timelines and updates before each project stage" },
      { icon: "fa-solid fa-handshake", image: "", label: "Satisfaction Promise", text: "Concerns addressed promptly before final payment" },
    ],
  },
  clientMessage: "Hi, here is the quote we discussed. Please review the scope and let me know if you have any questions.",
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function prepareStorage(page) {
  await page.addInitScript(({ businessProfile, quoteStyle }) => {
    localStorage.setItem("ald_company_logo", "ald-logo.svg");
    localStorage.setItem("ald_business_profile", JSON.stringify(businessProfile));
    localStorage.setItem("ald_quote_send_style", JSON.stringify(quoteStyle));
    localStorage.setItem("ald_autosave_enabled", "false");
    localStorage.setItem("ald_builder_guide_hidden", "1");
    localStorage.setItem("ald_quote_prefs", JSON.stringify({ taxRate: 13, currency: "CAD", heading: "Your Quote" }));
  }, { businessProfile, quoteStyle });
}

async function saveShot(page, name) {
  await page.screenshot({
    path: resolve(captureDir, name),
    fullPage: false,
  });
}

async function loadBuilder(page) {
  await page.goto(`http://127.0.0.1:${port}/quote-builder.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#clientName", { timeout: 30000 });
  await wait(900);
  await page.evaluate(({ quoteData, quoteStyle }) => {
    if (typeof applyQuoteData === "function") applyQuoteData(quoteData);
    if (typeof renderTermsCheckboxes === "function") renderTermsCheckboxes();
    if (typeof calculateTotals === "function") calculateTotals();
    window._quoteStyle = quoteStyle;
    localStorage.setItem("ald_quote_send_style", JSON.stringify(quoteStyle));
    const guide = document.getElementById("builderGuideCard");
    if (guide) guide.style.display = "none";
    const warning = document.getElementById("draftWarningBanner");
    if (warning) warning.style.display = "none";
    if (typeof applyBuilderGuideVisibility === "function") applyBuilderGuideVisibility();
  }, { quoteData, quoteStyle });
}

async function run() {
  await new Promise((resolve) => server.listen(port, resolve));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.warn("Page error:", error.message));

  await prepareStorage(page);

  await page.goto(`http://127.0.0.1:${port}/settings.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#logoPreviewImg", { timeout: 30000 });
  await wait(900);
  await page.evaluate(() => {
    if (typeof showTab === "function") showTab("business");
    if (typeof showLogoPreview === "function") showLogoPreview("ald-logo.svg");
    const name = document.getElementById("businessName");
    if (name) name.value = "ALD Direct Inc.";
    const tagline = document.getElementById("tagline");
    if (tagline) tagline.value = "Repair Renovate Revive";
  });
  await saveShot(page, "01-logo-settings.png");

  await loadBuilder(page);
  await page.evaluate(() => {
    if (typeof openQuoteSendSettingsModal === "function") openQuoteSendSettingsModal(true);
  });
  await page.waitForSelector("#quoteStyleModal.show", { timeout: 10000 });
  await page.click('[data-preset="warm-renovation"]');
  await page.locator('#quoteHeaderOpacity').evaluate((el) => {
    el.value = "82";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(600);
  await saveShot(page, "02-style-modal.png");

  await page.click('[data-bs-target="#quoteStyleTabView"]');
  await wait(400);
  await page.locator("#quoteStyleModal .modal-body").evaluate((el) => { el.scrollTop = 560; });
  await page.click('[data-commitment-icon-toggle="2"]');
  await wait(500);
  await saveShot(page, "03-commitment-icons.png");

  await page.keyboard.press("Escape");
  await wait(400);
  await page.evaluate(() => {
    const modal = bootstrap.Modal.getInstance(document.getElementById("quoteStyleModal"));
    if (modal) modal.hide();
  });
  await wait(500);
  await page.evaluate(() => {
    const terms = document.getElementById("termsCollapse");
    if (terms) terms.style.display = "block";
    document.querySelectorAll("#termsCheckboxes input[type='checkbox']").forEach((checkbox, index) => {
      checkbox.checked = index === 0 || index === 2 || index === 3 || index === 5;
    });
    if (typeof updateTermsCount === "function") updateTermsCount();
    const termsCard = document.getElementById("termsCollapse");
    if (termsCard) termsCard.scrollIntoView({ block: "center" });
  });
  await wait(350);
  await saveShot(page, "04-terms.png");

  const viewerQuote = await page.evaluate((quoteStyle) => {
    const data = typeof collectQuoteData === "function" ? collectQuoteData() : {};
    data.style = quoteStyle;
    data.grandTotal = 9248;
    data.total = 9248;
    return data;
  }, quoteStyle);
  await page.evaluate((viewerQuote) => {
    localStorage.setItem("customize_brand_quote", JSON.stringify(viewerQuote));
    localStorage.setItem("ald_last_preview_quote", "customize_brand_quote");
  }, viewerQuote);

  await page.goto(`http://127.0.0.1:${port}/interactive-quote-viewer.html?quote=customize_brand_quote`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#quoteContainer", { timeout: 30000 });
  await wait(1400);
  await saveShot(page, "05-client-quote.png");

  await browser.close();
  server.close();
}

run().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
