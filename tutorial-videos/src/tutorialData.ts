export type TutorialScene = {
  eyebrow: string;
  title: string;
  body: string;
  callout: string;
  fields: string[];
  highlight: string;
};

export type Tutorial = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  durationInFrames: number;
  scenes: TutorialScene[];
};

const commonDuration = 420;

export const tutorials: Tutorial[] = [
  {
    id: "quote-builder-overview",
    title: "Build a quote in minutes",
    subtitle: "Rooms, saved items, totals, and client-ready structure.",
    accent: "#1a56a0",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Start with the client and job",
        body: "Add the client, address, and quote number so every quote is easy to find later.",
        callout: "Clean project setup",
        fields: ["Client: Sarah Jones", "Address: 24 Maple Ave", "Quote #: QD-1042"],
        highlight: "Client information",
      },
      {
        eyebrow: "Step 2",
        title: "Break the job into rooms",
        body: "Use rooms or areas so clients can scan the scope and you can track subtotals.",
        callout: "Kitchen + Basement + Exterior",
        fields: ["Kitchen", "Basement", "Exterior"],
        highlight: "Room sections",
      },
      {
        eyebrow: "Step 3",
        title: "Review margin before sending",
        body: "Quote Dr keeps totals, markup, material cost, tax, and profit visible while you build.",
        callout: "Ready to send",
        fields: ["Subtotal $8,450", "Margin 34%", "Deposit 50%"],
        highlight: "Profit report",
      },
    ],
  },
  {
    id: "line-items-pricing",
    title: "Add line items fast",
    subtitle: "Use saved items, unit rates, notes, and material costs.",
    accent: "#0f766e",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Search your saved pricing",
        body: "Pick common services from your database instead of typing every line from scratch.",
        callout: "Tile install found",
        fields: ["Tile install", "Baseboard paint", "Vanity install"],
        highlight: "Quick search",
      },
      {
        eyebrow: "Step 2",
        title: "Adjust quantity and rate",
        body: "Fine tune units, quantities, rates, notes, and client-facing descriptions.",
        callout: "20 sq ft @ $18",
        fields: ["Unit: sq ft", "Quantity: 20", "Rate: $18"],
        highlight: "Line item details",
      },
      {
        eyebrow: "Step 3",
        title: "Track real material cost",
        body: "Enter your cost separately so Quote Dr can show margin without exposing it to the client.",
        callout: "Margin stays visible",
        fields: ["Material cost: $6.50", "Client rate: $18", "Profit tracked"],
        highlight: "Material cost",
      },
    ],
  },
  {
    id: "ai-voice-quote",
    title: "AI voice-to-quote",
    subtitle: "Talk through the job and let Quote Dr draft the first version.",
    accent: "#7c3aed",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Tap the microphone",
        body: "Describe the job naturally while you walk the site or sit in the truck.",
        callout: "Bathroom refresh, demo tile...",
        fields: ["Remove old tile", "Install new vanity", "Paint walls"],
        highlight: "Voice capture",
      },
      {
        eyebrow: "Step 2",
        title: "AI organizes the scope",
        body: "Rooms, tasks, and likely line items are grouped into a quote structure.",
        callout: "Draft quote built",
        fields: ["Bathroom", "Demolition", "Painting"],
        highlight: "AI draft",
      },
      {
        eyebrow: "Step 3",
        title: "Review, price, and send",
        body: "You stay in control. Edit the AI draft, confirm rates, then send the client link.",
        callout: "Quote ready",
        fields: ["Review items", "Confirm totals", "Send link"],
        highlight: "Human review",
      },
    ],
  },
  {
    id: "satellite-measure",
    title: "Satellite Measure",
    subtitle: "Measure roofs, fences, decks, driveways, and exterior scopes.",
    accent: "#2563eb",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Search the property",
        body: "Open the satellite map and search the project address.",
        callout: "Map centered on job site",
        fields: ["24 Maple Ave", "Satellite view", "Trade preset"],
        highlight: "Address search",
      },
      {
        eyebrow: "Step 2",
        title: "Draw areas or lengths",
        body: "Trace a roof, patio, driveway, fence run, or perimeter with simple clicks.",
        callout: "1,240 sq ft measured",
        fields: ["Area measure", "Linear measure", "Undo point"],
        highlight: "Measurement tools",
      },
      {
        eyebrow: "Step 3",
        title: "Add the measurement to the quote",
        body: "Choose the item, rate, room, waste, pitch, or gate deduction and add it.",
        callout: "Line item added",
        fields: ["Roof area", "Waste 10%", "$7.50 / sq ft"],
        highlight: "Add to quote",
      },
    ],
  },
  {
    id: "ikea-quick-quote",
    title: "IKEA Quick Quote",
    subtitle: "Turn an IKEA order PDF into install line items.",
    accent: "#e87e2a",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Upload the IKEA order",
        body: "Drop in the order PDF or paste the order text from the client.",
        callout: "PDF loaded",
        fields: ["SEKTION cabinet", "Drawer fronts", "Panels"],
        highlight: "Order import",
      },
      {
        eyebrow: "Step 2",
        title: "Parse and review the install items",
        body: "Quote Dr detects cabinet install work and skips hardware or accessories.",
        callout: "34 install items found",
        fields: ["Base cabinet", "Wall cabinet", "Tall cabinet"],
        highlight: "Parsed items",
      },
      {
        eyebrow: "Step 3",
        title: "Apply your labour rates",
        body: "Use your saved IKEA pricing, adjust any odd items, and add the kitchen to the quote.",
        callout: "Hours saved",
        fields: ["Set rates", "Review total", "Add to Kitchen"],
        highlight: "Quick quote",
      },
    ],
  },
  {
    id: "send-client-quote",
    title: "Send a client-ready quote",
    subtitle: "Preview the client view, approvals, upgrades, and payment options.",
    accent: "#16a34a",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Choose the client view",
        body: "Pick pricing detail, approval type, deposit display, and quote expiry.",
        callout: "Client view settings",
        fields: ["Pricing detail", "Approval type", "Deposit display"],
        highlight: "Send settings",
      },
      {
        eyebrow: "Step 2",
        title: "Preview before sending",
        body: "Open the client view to see exactly what the customer receives.",
        callout: "No surprises",
        fields: ["Mobile view", "Line items", "Terms"],
        highlight: "Preview quote",
      },
      {
        eyebrow: "Step 3",
        title: "Share the quote link",
        body: "Copy the link, email the client, or let them approve and request changes online.",
        callout: "Quote sent",
        fields: ["Copy link", "Email client", "Client approval"],
        highlight: "Share link",
      },
    ],
  },
  {
    id: "invoice-payments",
    title: "Invoices and payments",
    subtitle: "Turn accepted quotes into invoices and collect deposits or full payments.",
    accent: "#15803d",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Generate the invoice",
        body: "Use the current quote rooms, totals, terms, and client details to create an invoice.",
        callout: "Invoice ready",
        fields: ["Client", "Quote total", "Terms"],
        highlight: "Create invoice",
      },
      {
        eyebrow: "Step 2",
        title: "Show payment options",
        body: "Offer Stripe card payments, e-transfer, cheque, cash, or custom instructions.",
        callout: "Payment choices",
        fields: ["Stripe", "E-transfer", "Cheque / Cash"],
        highlight: "Payment settings",
      },
      {
        eyebrow: "Step 3",
        title: "Send and track",
        body: "Email the invoice, open the payment link, and keep job status moving.",
        callout: "Paid faster",
        fields: ["Email invoice", "Open invoice", "Track status"],
        highlight: "Send invoice",
      },
    ],
  },
  {
    id: "floor-plan-scanner",
    title: "Floor Plan Scanner",
    subtitle: "Use plans and room drawings to speed up takeoffs.",
    accent: "#9333ea",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Upload the plan",
        body: "Add the floor plan image or PDF and get ready to calibrate it.",
        callout: "Plan uploaded",
        fields: ["PDF plan", "Image plan", "Calibration"],
        highlight: "Upload plan",
      },
      {
        eyebrow: "Step 2",
        title: "Review detected measurements",
        body: "Use the scanner output as a fast starting point and double-check important numbers.",
        callout: "Rooms detected",
        fields: ["Area", "Length", "Room labels"],
        highlight: "Detected takeoff",
      },
      {
        eyebrow: "Step 3",
        title: "Send quantities to the quote",
        body: "Add useful measurements to the right rooms and line items.",
        callout: "Takeoff added",
        fields: ["Room", "Quantity", "Unit"],
        highlight: "Add quantities",
      },
    ],
  },
  {
    id: "material-calculators",
    title: "Material calculators",
    subtitle: "Estimate flooring, paint, drywall, and common room materials.",
    accent: "#0ea5e9",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Enter dimensions or scan the quote",
        body: "Use dimensions, known square footage, or existing quote lines as the starting point.",
        callout: "Room measurements",
        fields: ["Width", "Length", "Ceiling height"],
        highlight: "Input details",
      },
      {
        eyebrow: "Step 2",
        title: "Set waste and coverage",
        body: "Adjust waste, box coverage, paint coverage, coats, primer, and openings.",
        callout: "Real-world factors",
        fields: ["Waste %", "Coverage", "Doors / windows"],
        highlight: "Calculator options",
      },
      {
        eyebrow: "Step 3",
        title: "Add results to the quote",
        body: "Review material quantities and send them into your current room.",
        callout: "Items added",
        fields: ["Flooring", "Paint", "Drywall"],
        highlight: "Add to quote",
      },
    ],
  },
  {
    id: "quickbooks-settings",
    title: "QuickBooks and settings",
    subtitle: "Connect accounting, manage preferences, and keep Quote Dr tuned to your business.",
    accent: "#1d4ed8",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Step 1",
        title: "Open Settings",
        body: "Set business profile, tax, currency, units, payment rules, and templates.",
        callout: "Business setup",
        fields: ["Logo", "Tax", "Units"],
        highlight: "Settings",
      },
      {
        eyebrow: "Step 2",
        title: "Connect QuickBooks",
        body: "Use the integration to reduce duplicate admin work after quotes and invoices are created.",
        callout: "Accounting connected",
        fields: ["Connect", "Sync", "Review"],
        highlight: "QuickBooks",
      },
      {
        eyebrow: "Step 3",
        title: "Keep data reusable",
        body: "Update clients, items, prices, and templates so future quotes get faster.",
        callout: "Reusable setup",
        fields: ["Clients", "Items", "Templates"],
        highlight: "Saved data",
      },
    ],
  },
  {
    id: "landing-overview",
    title: "Quote Dr in action",
    subtitle: "A quick marketing overview for contractors and service pros.",
    accent: "#f27a1a",
    durationInFrames: commonDuration,
    scenes: [
      {
        eyebrow: "Built for service pros",
        title: "Quote faster from the job site",
        body: "Use voice, templates, saved items, and mobile-friendly tools to get the quote done sooner.",
        callout: "Minutes, not hours",
        fields: ["Voice-to-quote", "Saved pricing", "Mobile builder"],
        highlight: "Fast quoting",
      },
      {
        eyebrow: "Professional client experience",
        title: "Send an interactive quote link",
        body: "Clients can review scope, choose upgrades, request changes, approve, and pay.",
        callout: "Better than a PDF",
        fields: ["Client link", "Approvals", "Payments"],
        highlight: "Client view",
      },
      {
        eyebrow: "Less admin",
        title: "Track jobs, invoices, and profit",
        body: "Stay organized from first walkthrough through invoice and follow-up.",
        callout: "Quote Dr keeps it together",
        fields: ["Dashboard", "Invoices", "Margins"],
        highlight: "Job tracking",
      },
    ],
  },
];
