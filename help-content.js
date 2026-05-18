// QuoteDr contextual help content.
// Add future walkthrough videos with a videoUrl property on any topic.
(function() {
    const TOPICS = {
        addRoomModal: {
            title: 'Add Room/Area Break',
            summary: 'Use rooms or areas to break a quote into clean sections the client can understand.',
            steps: [
                'Enter a clear room or work area name, like Kitchen, Basement, Exterior, or Garage.',
                'Click Add Room Break to create the section.',
                'Add line items inside that room so subtotals stay organized.'
            ],
            tips: [
                'Use room names for client-facing spaces and area names for larger scopes.',
                'Templates work best when rooms are named consistently.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        addLineModal: {
            title: 'Add Line Item',
            summary: 'Line items are the services, materials, labour, and notes that make up each room total.',
            steps: [
                'Use Quick Search to find a saved service fast, or choose a category and service manually.',
                'Adjust description, unit type, quantity, and rate as needed.',
                'Use Material Costs when you want to track your cost separately from the client rate.',
                'Click Add Line Item to place it in the selected room.'
            ],
            tips: [
                'Save common custom items so they show up next time.',
                'Descriptions can be written client-friendly, while notes can hold extra internal detail.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        manageItemsModal: {
            title: 'Manage Line Items',
            summary: 'This is your pricing database: the saved items QuoteDr uses for quick entry and AI-assisted quoting.',
            steps: [
                'Use New Item to add a category, item name, unit type, rate, description, material cost, and supplier URL.',
                'Edit existing rows directly, open Details for descriptions/photos/upgrades, then use Save Changed or Save All.',
                'Use Manage Items > Choice Group to create saved groups from your saved item database.',
                'Use Pick One when the client should choose one material or option. Use Pick Multiple when they can select several.',
                'Keep auto-grouping on when you want QuoteDr to use the saved group automatically whenever one of its items is added.'
            ],
            tips: [
                'Keep item names short and searchable, like Tile install or Baseboard paint.',
                'Material cost is for your margin tracking; rate is what you charge.',
                'Turn Off Grouping only affects the current quote row; it does not change the saved group template.',
                'Click the Pick One badge in the quote to choose which option appears first for the client.'
            ],
            helpUrl: 'help.html#pricing-database'
        },
        manageClientsModal: {
            title: 'Client Database',
            summary: 'Save repeat clients so names, phone numbers, emails, and addresses auto-fill in future quotes.',
            steps: [
                'Enter or edit the client details at the top.',
                'Click Save Client.',
                'Use the client list below to find, edit, or reuse saved clients.'
            ],
            tips: [
                'Saving clients reduces typing and helps prevent quote delivery mistakes.',
                'Client data syncs when you are signed into your QuoteDr account.'
            ],
            helpUrl: 'help.html#clients-data'
        },
        saveQuoteModal: {
            title: 'Save Quote',
            summary: 'Save your quote so it is available later and can sync across devices.',
            steps: [
                'Review the quote name, client, and quote number.',
                'Choose the save option shown in the modal.',
                'Wait for the saved confirmation before closing the browser.'
            ],
            tips: [
                'Auto-save helps during editing, but using Save intentionally before leaving is still a good habit.',
                'Cloud-saved quotes can be opened from the dashboard or Open Quote modal.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        loadQuoteModal: {
            title: 'Open Quote',
            summary: 'Open a saved quote from the cloud or, when supported, from a local file.',
            steps: [
                'Select a quote from the cloud list.',
                'Use Open Local File if you need to load an exported .aldquote file.',
                'Confirm if QuoteDr warns you about unsaved changes first.'
            ],
            tips: [
                'Save your current quote before opening another one.',
                'Cloud quotes are best for moving between phone, tablet, and desktop.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        quoteStyleModal: {
            title: 'Send Quote Settings',
            summary: 'Control how your quote looks and what your client can see before sending it.',
            steps: [
                'Choose a visual style and accent colour.',
                'Set the client pricing detail, deposit display, approval type, and expiry.',
                'Write or adjust the client message.',
                'Generate the client link when the settings look right.'
            ],
            tips: [
                'Use less pricing detail for simple jobs and more detail for larger projects.',
                'Save defaults if you want the same style on future quotes.'
            ],
            helpUrl: 'help.html#sending-quotes'
        },
        interactiveLinkModal: {
            title: 'Quote Ready',
            summary: 'Share the client quote link by copying it, emailing it, or opening the client view.',
            steps: [
                'Copy the link to send by text, email, or messenger.',
                'Or enter the client email and send directly from QuoteDr.',
                'Open Client View to preview exactly what the client will see.'
            ],
            tips: [
                'Previewing the client view before sending catches most small mistakes.',
                'If the client email is missing, add it to Client Information for next time.'
            ],
            helpUrl: 'help.html#sending-quotes'
        },
        sendInvoiceModal: {
            title: 'Invoice Ready',
            summary: 'Use this modal to send or open the invoice generated from the current quote.',
            steps: [
                'Wait for the sharing save to finish.',
                'Email the invoice directly or open it in a new tab.',
                'Confirm the invoice total and client details before sending.'
            ],
            tips: [
                'The invoice uses the current quote rooms, items, total, and terms.',
                'Quote status is updated to invoiced when possible.'
            ],
            helpUrl: 'help.html#invoices-payments'
        },
        voiceQuoteModal: {
            title: 'AI Quote Builder',
            summary: 'Speak the job scope and QuoteDr turns it into rooms and line items.',
            steps: [
                'Tap the microphone and describe the project clearly. Use Pause/Resume if you need to stop mid-recording.',
                'Include rooms, major tasks, quantities, and any important materials.',
                'Stop recording, review the transcript, then generate the quote.',
                'Use AI Voice Review to include or remove parsed items, match phrases to saved items, and fix uncertain rows.',
                'Use AI Memory, AI Trade Rules, and Voice Templates to teach QuoteDr your wording and repeatable packages.',
                'If saved Choice Groups are found, choose Yes, No, or Review before grouped items are added.'
            ],
            tips: [
                'Example: Bathroom renovation, remove tile, install new vanity, paint walls.',
                'AI works best when your saved pricing items are up to date.',
                'AI Memory learns phrase-to-item corrections per user.',
                'AI Trade Rules are best for contractor shorthand, such as casing doors or applying trim quantities.',
                'Voice Templates are best for packages like a standard bedroom package.'
            ],
            helpUrl: 'help.html#ai-features'
        },
        measureMapModal: {
            title: 'Measure from Satellite Map',
            summary: 'Use the map to measure outdoor areas, lengths, roofs, fences, driveways, and similar work.',
            steps: [
                'Search the project address so the map opens on the job site.',
                'Choose a trade preset if one fits the job, such as roofing, siding, deck, fence, driveway, or landscaping.',
                'Pick Area Measure for surfaces like roofs, patios, sod, or driveways. Pick Linear Measure for fences, edging, trenching, or runs.',
                'Click around the map to draw the shape or line. Use Undo for the last point or Clear to start over.',
                'Click a measurement in the list if you need to edit its item, pitch, waste, openings, gates, or quantity settings.',
                'Choose the target room, item name, rate, and quantity mode at the bottom.',
                'Click Add to Quote when the measurement and pricing look right.'
            ],
            tips: [
                'Use trade presets to quickly switch quantity behaviour.',
                'Rename measurements so the resulting line items are easy to understand.',
                'Roof pitch, waste, openings, and gates can change the final quote quantity, so review them before adding.',
                'Satellite measurements are excellent for estimating, but confirm critical dimensions on site when accuracy matters.'
            ],
            helpUrl: 'help.html#measurement-tools'
        },
        floorPlanModal: {
            title: 'Floor Plan Scanner',
            summary: 'Upload or scan a floor plan so QuoteDr can help extract useful measurements.',
            steps: [
                'Upload the plan image or PDF.',
                'Follow the on-screen calibration and review steps.',
                'Check detected measurements before adding anything to the quote.',
                'Send useful quantities into the right room or line item.'
            ],
            tips: [
                'Clean, high-resolution plans give better results.',
                'Always review AI or scanner outputs before relying on them.'
            ],
            helpUrl: 'help.html#measurement-tools'
        },
        ikeaQuickQuoteModal: {
            title: 'IKEA Quick Quote',
            summary: 'Turn an IKEA order list into install line items using your saved IKEA pricing.',
            steps: [
                'Upload the IKEA order PDF or paste the order text.',
                'Parse the order and review the detected cabinet items.',
                'Set or confirm your IKEA install prices in My Prices.',
                'Choose the target room and add the results to the quote.'
            ],
            tips: [
                'Use My Prices before quoting a client so the totals reflect your rates.',
                'Review unparsed items manually so nothing is missed.'
            ],
            helpUrl: 'help.html#specialty-tools'
        },
        materialEstimatorModal: {
            title: 'Quick Room Quoter',
            summary: 'Build a quick room quote from dimensions, openings, waste settings, and the enabled outputs from your saved pricing setup.',
            steps: [
                'Enter the room name, width, length, ceiling height, doors, and windows.',
                'Use the adjustment checkboxes to include or skip ceiling paint and ceiling drywall when those outputs apply.',
                'Calculate the recommended line items and quantities.',
                'Review the results and choose the target room.',
                'Add the quick quote as a new room or append it to an existing room.'
            ],
            tips: [
                'Set pricing once so future estimates come in with rates already filled.',
                'Use this as a fast estimate, then adjust line items for real site conditions.'
            ],
            helpUrl: 'help.html#measurement-tools'
        },
        estimatorPricingModal: {
            title: 'Set Up Estimator Pricing',
            summary: 'Choose which Quick Room Quoter outputs are used, then connect each active output to one or more saved items or manual rates.',
            steps: [
                'Leave Use checked for outputs you want in quick room quotes, or uncheck outputs you want skipped for now.',
                'For each active output, choose one or more saved items or enter a rate.',
                'Save pricing when every common material is mapped.',
                'Return to the estimator and calculate again.'
            ],
            tips: [
                'Saved item links keep estimator pricing consistent with your main price database.',
                'Disabled outputs keep their pricing, so you can turn them back on later without rebuilding the setup.',
                'Use manual rates only when you do not need a reusable database item.'
            ],
            helpUrl: 'help.html#pricing-database'
        },
        hardwoodCalcModal: {
            title: 'Hardwood/LVP Calculator',
            summary: 'Calculate flooring quantities by dimensions or by scanning existing quote items.',
            steps: [
                'Enter room dimensions or total square feet.',
                'Set plank width, waste percentage, and box coverage.',
                'Calculate the material need.',
                'Add the result to the quote when it looks right.'
            ],
            tips: [
                'Typical waste is often 7-15%, depending on layout and product.',
                'Use Scan Quote to reuse square footage already entered elsewhere.'
            ],
            helpUrl: 'help.html#calculators'
        },
        paintCalcModal: {
            title: 'Paint Calculator',
            summary: 'Estimate paint needs from dimensions, openings, coats, primer, and coverage.',
            steps: [
                'Enter dimensions or known wall/ceiling square footage.',
                'Set doors, windows, coats, primer, and coverage per gallon.',
                'Calculate the paint quantity.',
                'Add the result to the quote if needed.'
            ],
            tips: [
                'Coverage varies by product and surface; adjust from the paint label when possible.',
                'Primer and extra coats can change totals quickly.'
            ],
            helpUrl: 'help.html#calculators'
        },
        drywallCalcModal: {
            title: 'Drywall Calculator',
            summary: 'Estimate drywall quantities from room dimensions or scanned quote square footage.',
            steps: [
                'Enter the room dimensions, ceiling height, doors, and windows.',
                'Choose sheet size and waste options.',
                'Calculate the material requirement.',
                'Add the result to the quote.'
            ],
            tips: [
                'Double-check ceiling inclusion and openings before quoting.',
                'Use Scan Quote when drywall square footage is already in the estimate.'
            ],
            helpUrl: 'help.html#calculators'
        },
        manageTemplatesModal: {
            title: 'Manage Templates',
            summary: 'Templates let you reuse common room and item setups on future quotes.',
            steps: [
                'Review saved templates in the list.',
                'Drag to reorder the templates that appear first.',
                'Delete templates you no longer use.'
            ],
            tips: [
                'Create templates for common job types like bathroom refresh or basement finish.',
                'Keep template names specific so they are easy to pick from the menu.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        shareTemplateModal: {
            title: 'Share Template to Community',
            summary: 'Publish one of your saved templates so other contractors can import the room structure into their own QuoteDr account.',
            steps: [
                'Give the template a clear name and description so other users know what kind of job it fits.',
                'Choose the trade, region, and job type to make the template easier to find.',
                'Decide whether to include pricing. If pricing is off, QuoteDr strips rates, material costs, totals, and markup to $0 before publishing.',
                'Choose whether to show your contributor name or post anonymously.',
                'Click Publish Template only after reviewing what will be shared.'
            ],
            tips: [
                'Most users should share structure without pricing unless they intentionally want to share market rates.',
                'Keep descriptions practical: scope included, assumptions, and what the template is best used for.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        communityTemplatesModal: {
            title: 'Community Templates',
            summary: 'Browse templates shared by other QuoteDr users and import useful job structures into your own template library.',
            steps: [
                'Use search, trade, and region filters to narrow the marketplace.',
                'Check whether a template includes pricing or imports with rates set to $0.',
                'Click Add to My Templates to copy it into your private template library.',
                'After importing, open Manage Templates or add the template to a quote and review every room, item, quantity, and rate.',
                'Use thumbs up, thumbs down, or report to help keep the marketplace useful.'
            ],
            tips: [
                'Community templates are starting points, not finished quotes. Always adjust pricing for your market and scope.',
                'If the marketplace is unavailable, the database migration may not be deployed yet.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        roomColorModal: {
            title: 'Room Header Colours',
            summary: 'Customize the colour used on room headers so quote sections are easier to scan and match your preferred style.',
            steps: [
                'Pick a custom colour with the colour picker or choose one of your saved preset colours.',
                'Use Header colour intensity on the room card to make the colour stronger or more subtle.',
                'Save useful colours as presets so they are available on future rooms.',
                'Choose a default colour when you want new rooms to start with the same look.',
                'Use Done when the room colour setup looks right.'
            ],
            tips: [
                'Subtle header colours usually look more professional on client-facing quotes.',
                'Use consistent colours for repeat room types if it helps you scan larger quotes faster.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        notesReviewModal: {
            title: 'Client Notes Review',
            summary: 'Review client-requested changes or comments before updating a quote.',
            steps: [
                'Read each client note carefully.',
                'Open the quote to make changes when needed.',
                'Mark notes resolved only after you have reviewed or handled them.'
            ],
            tips: [
                'Use this as your follow-up checklist after a client reviews a quote.',
                'Keep the client view updated after changes are made.'
            ],
            helpUrl: 'help.html#sending-quotes'
        },
        warrantyModal: {
            title: 'Warranty Certificate',
            summary: 'Generate a warranty document for completed or accepted work.',
            steps: [
                'Select the warranty period.',
                'Describe what is covered and what is excluded.',
                'Enter the authorized contractor name.',
                'Generate the PDF for the client.'
            ],
            tips: [
                'Be specific about exclusions to avoid confusion later.',
                'Match warranty language to your actual business policy.'
            ],
            helpUrl: 'help.html#invoices-payments'
        },
        changeOrderModal: {
            title: 'Change Order',
            summary: 'Create and review work changes after the original quote has been accepted or sent.',
            steps: [
                'Describe the change and choose the reason.',
                'Add line items with quantities, units, and prices.',
                'Review existing change orders from the View tab.',
                'Save the change order so the project scope stays documented.'
            ],
            tips: [
                'Use change orders for extra work, scope changes, and unforeseen site conditions.',
                'Keep descriptions clear enough that the client understands what changed.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        portalShareModal: {
            title: 'Client Portal Access',
            summary: 'Share a secure portal link and PIN with your client.',
            steps: [
                'Copy the portal link and PIN together.',
                'Send both to the client through your preferred channel.',
                'Reset the PIN if you need to revoke old access.'
            ],
            tips: [
                'Clients need both the link and PIN to sign in.',
                'Resetting the PIN makes the previous PIN stop working.'
            ],
            helpUrl: 'help.html#clients-data'
        },
        portalAssignModal: {
            title: 'Add to Client Portal',
            summary: 'Attach quotes, invoices, and project documents to a client portal so the client has one organized place to review them.',
            steps: [
                'Choose the client portal or project folder the document belongs to.',
                'Review the quote or invoice being attached before saving.',
                'Save the portal assignment so the document appears in the client portal.',
                'Use Client Portal Access when you are ready to share the portal link and PIN.'
            ],
            tips: [
                'Use portal grouping when one client has multiple quotes, invoices, or change orders for the same job.',
                'Portal assignments are internal until you share portal access with the client.'
            ],
            helpUrl: 'help.html#clients-data'
        },
        newQuoteModal: {
            title: 'Start a New Quote',
            summary: 'Create a cloud-saved quote shell before opening the builder.',
            steps: [
                'Enter the client name.',
                'Add the project address and quote number if you already know them.',
                'Click Create & Open Builder.',
                'Add rooms and line items once the builder opens.'
            ],
            tips: [
                'Leaving quote number blank lets QuoteDr assign one automatically.',
                'Starting from the dashboard helps keep quotes saved from the beginning.'
            ],
            helpUrl: 'help.html#getting-started'
        },
        depositModal: {
            title: 'Request Deposit',
            summary: 'Create a Stripe checkout link for a deposit or full invoice payment.',
            steps: [
                'Enter the deposit amount or choose a percentage shortcut.',
                'Check the invoice total shown below the amount.',
                'Open Stripe Checkout and send or complete the payment flow.',
                'Use Settings > Payments to control the deposit payment button on quote links and the pay-in-full button on invoice links.'
            ],
            tips: [
                'Use the 25%, 50%, and Full buttons to avoid manual math.',
                'Confirm Stripe is connected before sending payment links to clients.',
                'Deposit payment button on quote links is for deposits; pay-in-full button on invoice links is for full balances.'
            ],
            helpUrl: 'help.html#invoices-payments'
        },
        invoiceSettingsModal: {
            title: 'Invoice Settings',
            summary: 'Control how generated invoices look before previewing, downloading, or sending them to a client.',
            steps: [
                'Set the invoice label if you want wording other than Invoice.',
                'Add an invoice note for a short client-facing message.',
                'Write payment terms that explain when and how payment is due.',
                'Choose whether the invoice should show line descriptions, room totals, terms, and payment options.',
                'Save Defaults to reuse these settings, or Apply to use them for the current invoice.'
            ],
            tips: [
                'Invoices should usually be cleaner than quotes. Show only the detail the client needs to pay confidently.',
                'Payment options only appear when the payment integration is enabled and available for that invoice.'
            ],
            helpUrl: 'help.html#invoices-payments'
        },
        aiVoiceTemplatesModal: {
            title: 'Voice Templates',
            summary: 'Teach AI Voice reusable phrases that add a prepared group of saved quote items.',
            steps: [
                'Enter a template name and the exact trigger phrase you want to say while recording.',
                'Choose a saved item and quantity rule for each line in the template.',
                'Use quantity basis to decide whether the item is fixed, based on floor area, room perimeter, or wall area.',
                'Add each line to the draft, then save the template.',
                'Use the saved phrase during AI Quote Builder and review the generated items before adding them.'
            ],
            tips: [
                'Voice templates are best for repeat packages like standard bedroom paint or bathroom demo prep.',
                'Keep trigger phrases short and natural so they are easy to remember on site.'
            ],
            helpUrl: 'help.html#ai-features'
        },
        aiVoiceMemoryModal: {
            title: 'AI Memory',
            summary: 'Review and edit what QuoteDr has learned from your AI Voice corrections.',
            steps: [
                'Open this list to see phrases that were mapped to saved items during previous AI Voice reviews.',
                'Edit the saved item mapping when a phrase should point somewhere else.',
                'Remove entries that are wrong or no longer useful.',
                'Refresh the list after making changes from another device or session.'
            ],
            tips: [
                'AI Memory is private to your account and helps future voice quotes match your wording.',
                'Correcting items during review is the best way to teach QuoteDr your preferred language.'
            ],
            helpUrl: 'help.html#ai-features'
        },
        aiVoiceTradeRulesModal: {
            title: 'AI Trade Rules',
            summary: 'Create contractor math rules so AI Voice can turn phrases into accurate quantities.',
            steps: [
                'Enter the phrase you normally say, such as case a door or baseboard a room.',
                'Choose the saved item that should be added when that phrase is heard.',
                'Set the quantity and whether it is fixed or multiplied by a count.',
                'Add a note if the rule needs context.',
                'Save the rule and test it in AI Quote Builder.'
            ],
            tips: [
                'Trade rules are useful for repeat math that AI would otherwise have to guess.',
                'Use clear count labels like door, window, opening, or room so the rule reads naturally.'
            ],
            helpUrl: 'help.html#ai-features'
        },
        aiVoiceMeasurementModal: {
            title: 'Missing AI Voice Measurement',
            summary: 'QuoteDr needs one or more measurements before it can calculate certain AI-generated items accurately.',
            steps: [
                'Read which measurement is missing and why it is needed.',
                'Enter the requested dimension, count, or area.',
                'Continue Review so QuoteDr can recalculate the affected line items.',
                'Review the final quantities before adding them to the quote.'
            ],
            tips: [
                'This protects you from AI guessing important quantities like wall area, ceiling height, or linear footage.',
                'Use approximate measurements only when you are comfortable with an estimate.'
            ],
            helpUrl: 'help.html#ai-features'
        },
        aiVoiceReviewModal: {
            title: 'Review AI Voice Items',
            summary: 'Check and correct AI-generated rooms, scope notes, items, quantities, rates, and saved-item matches before they land on the quote.',
            steps: [
                'Review each suggested room and line item from top to bottom.',
                'Fix item names, quantities, units, rates, and room placement as needed.',
                'Map unclear AI phrases to saved items when you want QuoteDr to remember the correction.',
                'Review generated scope notes for client-facing wording.',
                'Click Add Verified Items when the suggestions are ready for the quote.'
            ],
            tips: [
                'Do not send AI-generated items to a client without reviewing them first.',
                'Corrections made here improve future AI Voice results through AI Memory.'
            ],
            helpUrl: 'help.html#ai-features'
        },
        featureDetailModal: {
            title: 'Feature Details',
            summary: 'This landing-page panel explains one QuoteDr feature in more detail for visitors comparing the app.',
            steps: [
                'Read the short overview at the top of the panel.',
                'Review the feature points to understand what the tool is meant to solve.',
                'Close the panel to keep browsing the landing page.',
                'Use Sign In or pricing links when you are ready to try the feature inside the app.'
            ],
            tips: [
                'These panels are marketing explanations, not editable quote settings.',
                'Inside the signed-in app, Help buttons give workflow guidance for the actual tool.'
            ],
            helpUrl: 'help.html#getting-started'
        },
        tradeDetailModal: {
            title: 'Trade Details',
            summary: 'This landing-page panel explains how QuoteDr can fit a specific trade or service business.',
            steps: [
                'Read the trade-specific overview.',
                'Review the listed ways QuoteDr supports that workflow.',
                'Close the panel to compare other trades or continue through the landing page.'
            ],
            tips: [
                'Trade panels are examples. The quote builder can be customized with your own rooms, items, terms, and templates.',
                'Use templates and saved items inside the app to make QuoteDr fit your exact business.'
            ],
            helpUrl: 'help.html#getting-started'
        },
        signatureLightbox: {
            title: 'Signature Preview',
            summary: 'Preview the client signature attached to an accepted quote.',
            steps: [
                'Open the signature from the client portal quote.',
                'Review the displayed signature image.',
                'Close the preview when finished.'
            ],
            tips: [
                'Use this when confirming that a client approval was signed correctly.'
            ],
            helpUrl: 'help.html#clients-data'
        },
        installHelpModal: {
            title: 'Save QuoteDr to Your Phone',
            summary: 'Install QuoteDr as a home-screen app for faster mobile access.',
            steps: [
                'On iPhone or iPad, open QuoteDr in Safari and use Add to Home Screen.',
                'On Android, open QuoteDr in Chrome and choose Install app or Add to Home screen.',
                'Launch QuoteDr from the new home-screen icon.'
            ],
            tips: [
                'Installing the app makes QuoteDr feel more like a native mobile tool.',
                'If the browser install prompt does not show, use the manual steps in this modal.'
            ],
            helpUrl: 'help.html#getting-started'
        }
    };

    const ALIASES = {
        'signature-lightbox': 'signatureLightbox',
        templateManagerModal: 'manageTemplatesModal'
    };

    const INLINE_TOPICS = {
        quoteNumber: {
            title: 'Quote Number',
            summary: 'The quote number is the unique reference for this estimate. Clients may use it when approving, asking questions, or paying invoices.',
            steps: [
                'Use Next when you want QuoteDr to pick the next number in sequence.',
                'Use Randomize when you need a unique number quickly.',
                'Edit the number manually if your business already has a numbering system.'
            ],
            tips: [
                'Avoid reusing quote numbers, especially after a quote has been sent.',
                'Keep your numbering style consistent so old quotes are easy to find.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        materialCost: {
            title: 'Material Cost',
            summary: 'Material cost is your estimated cost, not the amount you charge the client. QuoteDr uses it for profit and margin tracking.',
            steps: [
                'Enter the cost per unit when you know it.',
                'Keep the client rate in the Rate field.',
                'Review the profit report to see how material costs affect margin.'
            ],
            tips: [
                'Leave material cost at 0 if you do not want to track margin for that line.',
                'Supplier links are useful for checking the cost again before ordering.'
            ],
            helpUrl: 'help.html#pricing-database'
        },
        supplierUrl: {
            title: 'Supplier URL',
            summary: 'Supplier URL is an optional link to the product or supplier page you used when setting the material price, kept for your records.',
            steps: [
                'Paste the page where you found the material price.',
                'Use it later to confirm pricing before ordering or updating your item database.',
                'Keep the Material Cost field updated when supplier pricing changes.'
            ],
            tips: [
                'This link is for your internal records and helps you remember where the material cost came from.',
                'Quote Dr. is working on supplier collaborations so this information can auto-update in the future.'
            ],
            helpUrl: 'help.html#pricing-database'
        },
        markup: {
            title: 'Markup',
            summary: 'Markup adds a percentage on top of a room total. It is usually hidden from the client and rolled into the displayed prices.',
            steps: [
                'Enter the markup percentage for the room.',
                'Use the eye button to choose whether the client can see that markup.',
                'Use Markup All when you want the same markup across every room.'
            ],
            tips: [
                'Most users should keep markup hidden from the client.',
                'Markup changes totals, so review the quote total after applying it.'
            ],
            helpUrl: 'help.html#building-quotes'
        },
        pricingDetail: {
            title: 'Pricing Detail',
            summary: 'Pricing detail controls how much price breakdown your client sees in the shared quote.',
            steps: [
                'Choose Full itemized quote for maximum transparency.',
                'Choose Category subtotals when the client needs structure but not every line price.',
                'Choose Total only for a simple proposal view.'
            ],
            tips: [
                'Use more detail on large or complex jobs.',
                'Use less detail when you want the client focused on the finished scope and total.'
            ],
            helpUrl: 'help.html#sending-quotes'
        },
        depositDisplay: {
            title: 'Deposit Display',
            summary: 'Deposit display controls whether the client sees a deposit amount in the shared quote.',
            steps: [
                'Use Auto when you want QuoteDr to follow your payment settings.',
                'Use Show when this quote should clearly show a deposit.',
                'Use Hide when you do not want deposit information on this quote.'
            ],
            tips: [
                'Deposit settings only affect the client display and payment flow.',
                'Set your default deposit percentage in payment or send settings.'
            ],
            helpUrl: 'help.html#invoices-payments'
        },
        approvalType: {
            title: 'Approval Type',
            summary: 'Approval type controls what action the client can take from the shared quote.',
            steps: [
                'Accept quote lets the client approve the quote directly.',
                'Accept or request changes lets the client approve or send notes back.',
                'Review only is useful when you want feedback without approval yet.'
            ],
            tips: [
                'Use Accept or request changes when the scope may still move.',
                'Use Review only for early budgets or rough estimates.'
            ],
            helpUrl: 'help.html#sending-quotes'
        },
        stripePayments: {
            title: 'Stripe Payments',
            summary: 'Stripe payment settings control whether clients see payment buttons on quote and invoice links.',
            steps: [
                'Enable payments when you are ready to accept card payments.',
                'Set the default deposit percentage.',
                'Choose whether clients see a deposit payment button on quote links.',
                'Choose whether clients see a pay-in-full button on invoice links.'
            ],
            tips: [
                'Check payment settings before sending payment links to clients.',
                'Deposit buttons usually belong on quotes; full-payment buttons usually belong on invoices.'
            ],
            helpUrl: 'help.html#invoices-payments'
        },
        taxRate: {
            title: 'Tax Rate and Label',
            summary: 'Tax settings control the tax line shown on quotes and invoices.',
            steps: [
                'Enter the tax percentage used by your business.',
                'Use the tax label your clients expect, such as HST, GST, VAT, or Sales Tax.',
                'Set the rate to 0 if you do not charge tax.'
            ],
            tips: [
                'Confirm tax requirements with your accountant.',
                'Changing tax settings affects future quote totals.'
            ],
            helpUrl: 'help.html#invoices-payments'
        }
    };

    const TUTORIAL_BASE = 'videos/tutorials/';
    const TOPIC_TUTORIALS = {
        addRoomModal: 'quote-builder-overview',
        addLineModal: 'line-items-pricing',
        manageItemsModal: 'line-items-pricing',
        manageClientsModal: 'quote-builder-overview',
        saveQuoteModal: 'quote-builder-overview',
        loadQuoteModal: 'quote-builder-overview',
        quoteStyleModal: 'send-client-quote',
        interactiveLinkModal: 'send-client-quote',
        sendInvoiceModal: 'invoice-payments',
        voiceQuoteModal: 'ai-voice-quote',
        measureMapModal: 'satellite-measure',
        floorPlanModal: 'floor-plan-scanner',
        ikeaQuickQuoteModal: 'ikea-quick-quote',
        materialEstimatorModal: 'material-calculators',
        estimatorPricingModal: 'material-calculators',
        hardwoodCalcModal: 'material-calculators',
        paintCalcModal: 'material-calculators',
        drywallCalcModal: 'material-calculators',
        manageTemplatesModal: 'quote-builder-overview',
        shareTemplateModal: 'quote-builder-overview',
        communityTemplatesModal: 'quote-builder-overview',
        roomColorModal: 'quote-builder-overview',
        notesReviewModal: 'send-client-quote',
        warrantyModal: 'send-client-quote',
        changeOrderModal: 'send-client-quote',
        portalAssignModal: 'send-client-quote',
        portalShareModal: 'send-client-quote',
        newQuoteModal: 'quote-builder-overview',
        depositModal: 'invoice-payments',
        invoiceSettingsModal: 'invoice-payments',
        aiVoiceTemplatesModal: 'ai-voice-quote',
        aiVoiceMemoryModal: 'ai-voice-quote',
        aiVoiceTradeRulesModal: 'ai-voice-quote',
        aiVoiceMeasurementModal: 'ai-voice-quote',
        aiVoiceReviewModal: 'ai-voice-quote',
        featureDetailModal: 'quote-builder-overview',
        tradeDetailModal: 'quote-builder-overview',
        signatureLightbox: 'send-client-quote',
        installHelpModal: 'quickbooks-settings'
    };

    const INLINE_TUTORIALS = {
        quoteNumber: 'quote-builder-overview',
        materialCost: 'line-items-pricing',
        supplierUrl: 'line-items-pricing',
        markup: 'line-items-pricing',
        pricingDetail: 'send-client-quote',
        depositDisplay: 'invoice-payments',
        approvalType: 'send-client-quote',
        stripePayments: 'invoice-payments',
        taxRate: 'quickbooks-settings'
    };

    function applyTutorialVideos(collection, map) {
        Object.keys(map).forEach(function(topicId) {
            if (collection[topicId]) {
                collection[topicId].videoUrl = TUTORIAL_BASE + map[topicId] + '.mp4';
            }
        });
    }

    applyTutorialVideos(TOPICS, TOPIC_TUTORIALS);
    applyTutorialVideos(INLINE_TOPICS, INLINE_TUTORIALS);

    window.QuoteDrHelpContent = {
        topics: TOPICS,
        inlineTopics: INLINE_TOPICS,
        aliases: ALIASES,
        getTopic: function(modalId) {
            return TOPICS[modalId] || TOPICS[ALIASES[modalId]] || null;
        },
        getInlineTopic: function(topicId) {
            return INLINE_TOPICS[topicId] || null;
        }
    };
})();
