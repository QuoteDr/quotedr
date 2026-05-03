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
                'Add a category, item name, unit type, and rate.',
                'Optionally add a client-facing description, material cost, and supplier URL.',
                'Edit existing rows directly, then save the row or use Save All Changes.',
                'Use search and category tools to keep long price lists manageable.'
            ],
            tips: [
                'Keep item names short and searchable, like Tile install or Baseboard paint.',
                'Material cost is for your margin tracking; rate is what you charge.'
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
                'Tap the microphone and describe the project clearly.',
                'Include rooms, major tasks, quantities, and any important materials.',
                'Stop recording, review the transcript, then generate the quote.',
                'Review the AI-created items before sending anything to a client.'
            ],
            tips: [
                'Example: Bathroom renovation, remove tile, install new vanity, paint walls.',
                'AI works best when your saved pricing items are up to date.'
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
            title: 'Material Estimator',
            summary: 'Estimate common room materials from basic dimensions and add them to your quote.',
            steps: [
                'Enter the room name, width, length, ceiling height, doors, and windows.',
                'Calculate the estimated material quantities.',
                'Review the results and choose the target room.',
                'Add the estimate to the quote.'
            ],
            tips: [
                'Set pricing once so future estimates come in with rates already filled.',
                'Use this as a fast estimate, then adjust line items for real site conditions.'
            ],
            helpUrl: 'help.html#measurement-tools'
        },
        estimatorPricingModal: {
            title: 'Set Up Estimator Pricing',
            summary: 'Connect estimator outputs to your saved items or manual rates.',
            steps: [
                'For each material type, choose a saved item or enter a rate.',
                'Save pricing when every common material is mapped.',
                'Return to the estimator and calculate again.'
            ],
            tips: [
                'Saved item links keep estimator pricing consistent with your main price database.',
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
                'Open Stripe Checkout and send or complete the payment flow.'
            ],
            tips: [
                'Use the 25%, 50%, and Full buttons to avoid manual math.',
                'Confirm Stripe is connected before sending payment links to clients.'
            ],
            helpUrl: 'help.html#invoices-payments'
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
        'signature-lightbox': 'signatureLightbox'
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
                'Choose whether quotes show deposit buttons and invoices show pay-in-full buttons.'
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
