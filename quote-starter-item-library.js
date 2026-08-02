(function initQuoteDrStarterLibrary(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./quote-review-construction-knowledge.js'));
    } else {
        root.QuoteDrStarterLibrary = factory(root.QuoteDrConstructionKnowledge);
    }
})(typeof window !== 'undefined' ? window : globalThis, function quoteDrStarterLibraryFactory(knowledge) {
    'use strict';

    if (!knowledge) throw new Error('QuoteDr construction knowledge is unavailable.');

    var VERSION = 1;
    var PROFILE_VERSION = 1;
    var MAX_EVENTS = 300;
    var ALLOWED_ACTIONS = {
        imported: true,
        saved: true,
        added_to_quote: true,
        dismissed: true,
        not_relevant: true,
        handled_by_others: true
    };
    var COMMON_UNITS = [
        'Flatrate',
        'each',
        'hourly',
        'sq ft',
        'LF',
        'linear ft',
        'sheet',
        'day',
        'allowance'
    ];
    var ALL_ROOM_TYPES = knowledge.ROOM_TYPES.map(function roomTypeId(roomType) {
        return roomType.id;
    });
    var INTERIOR_ROOMS = [
        'full_bathroom', 'powder_room', 'kitchen', 'bedroom', 'living_area',
        'dining_room', 'office', 'hallway_entry', 'laundry_mudroom',
        'basement_utility', 'garage_workshop', 'stairs_landing', 'whole_floor'
    ];
    var LIVING_ROOMS = [
        'bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry',
        'whole_floor'
    ];

    var CATEGORY_BY_TRADE = {
        general_conditions: 'General Conditions',
        demolition: 'Demolition',
        hazmat: 'Hazardous Materials',
        sitework_landscaping: 'Sitework & Landscaping',
        concrete_masonry: 'Concrete & Masonry',
        framing_structural: 'Framing & Structural',
        roofing: 'Roofing',
        exterior_envelope: 'Exterior Envelope',
        waterproofing: 'Waterproofing',
        plumbing: 'Plumbing',
        electrical: 'Electrical',
        hvac_ventilation: 'HVAC & Ventilation',
        insulation: 'Insulation',
        drywall: 'Drywall',
        tile_stone: 'Tile & Stone',
        flooring: 'Flooring',
        cabinets_vanities: 'Cabinets & Countertops',
        interior_doors_trim: 'Doors, Trim & Millwork',
        painting: 'Painting',
        accessories_hardware: 'Accessories & Hardware'
    };

    function compactText(value, maxLength) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 220);
    }

    function normalizeText(value) {
        return compactText(value, 2000)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function uniqueStrings(values, maxLength) {
        return (Array.isArray(values) ? values : [])
            .map(function normalizeValue(value) { return compactText(value, maxLength || 100); })
            .filter(Boolean)
            .filter(function unique(value, index, all) { return all.indexOf(value) === index; });
    }

    function entry(id, tradeId, name, unitType, description, roomTypes, knowledgeKeys, extra) {
        extra = extra || {};
        var trade = knowledge.getTrade(tradeId);
        if (!trade) throw new Error('Unknown starter item trade: ' + tradeId);
        var allowedPhases = Array.isArray(trade.phases)
            ? trade.phases.map(function phaseId(phase) { return phase.id; })
            : [];
        return {
            id: compactText(id, 100),
            version: VERSION,
            tradeId: tradeId,
            phases: uniqueStrings(extra.phases, 40).filter(function allowedPhase(phase) {
                return allowedPhases.indexOf(phase) !== -1;
            }),
            roomTypes: uniqueStrings(roomTypes, 60).filter(function validRoom(roomType) {
                return !!knowledge.getRoomType(roomType);
            }),
            knowledgeKeys: uniqueStrings(knowledgeKeys, 100).filter(function validRule(key) {
                var ruleItem = knowledge.getRule(key);
                return !!ruleItem && (ruleItem.findingKind || 'scope_gap') === 'scope_gap';
            }),
            category: compactText(extra.category || CATEGORY_BY_TRADE[tradeId], 100),
            name: compactText(name, 140),
            unitType: compactText(unitType, 40),
            description: compactText(description, 700),
            aliases: uniqueStrings(extra.aliases, 100)
        };
    }

    var CATALOG = [
        entry('general.site_protection', 'general_conditions', 'Site and Finish Protection', 'Flatrate', 'Protect access routes, floors, fixtures, and adjacent finished surfaces within the agreed work area. Review occupied-area separation, dust control, maintenance, and removal requirements for this project.', ALL_ROOM_TYPES, ['general_protection'], { aliases: ['floor protection', 'dust control', 'protect existing finishes'] }),
        entry('general.project_setup', 'general_conditions', 'Project Setup and Logistics', 'Flatrate', 'Coordinate initial site setup, material staging, delivery access, temporary-service needs, and agreed working-area controls. Confirm project-specific access and scheduling restrictions before use.', ALL_ROOM_TYPES, ['general_access'], { aliases: ['mobilization', 'site setup', 'project logistics'] }),
        entry('general.cleanup_disposal', 'general_conditions', 'Cleanup and Waste Handling', 'Flatrate', 'Provide routine work-area cleanup and the agreed handling of construction debris. Confirm bin, hauling, tipping-fee, daily cleanup, and final-cleanup responsibilities before finalizing.', ALL_ROOM_TYPES, ['general_cleanup_disposal'], { aliases: ['cleanup', 'debris disposal', 'waste handling'] }),
        entry('general.permits_inspections', 'general_conditions', 'Permit and Inspection Coordination', 'allowance', 'Coordinate the agreed permit and inspection tasks for the quoted work. Confirm who prepares applications, pays fees, schedules inspections, addresses deficiencies, and closes permits.', ALL_ROOM_TYPES, ['general_permits_inspections'], { aliases: ['permits', 'inspections', 'permit allowance'] }),

        entry('demo.selective_interior', 'demolition', 'Selective Interior Demolition', 'Flatrate', 'Remove the identified interior finishes, fixtures, or assemblies while protecting adjacent work to remain. Includes orderly separation and staging of debris within the agreed work area.', INTERIOR_ROOMS, [], { aliases: ['interior demolition', 'selective demo', 'tear out'] }),
        entry('demo.bathroom', 'demolition', 'Bathroom Demolition and Removal', 'Flatrate', 'Remove the identified bathroom fixtures and finishes to the agreed limits while protecting adjacent areas and service connections to remain. Confirm hazardous-material and concealed-condition procedures separately.', ['full_bathroom', 'powder_room'], [], { aliases: ['bathroom demo', 'bathroom tear out'] }),
        entry('demo.kitchen', 'demolition', 'Kitchen Demolition and Removal', 'Flatrate', 'Remove the identified cabinets, countertops, finishes, fixtures, and appliances to the agreed limits. Confirm disconnections, salvage items, disposal, and concealed-condition procedures before use.', ['kitchen'], [], { aliases: ['kitchen demo', 'cabinet removal'] }),
        entry('demo.roof_removal', 'demolition', 'Existing Roof Covering Removal', 'sq ft', 'Remove the identified existing roof covering and related loose materials to expose the agreed substrate for inspection and follow-on work. Confirm layer count, disposal, and deck repairs separately.', ['roof'], ['roof_removal'], { aliases: ['roof tear off', 'shingle removal'] }),

        entry('hazmat.assessment', 'hazmat', 'Hazardous Material Assessment Coordination', 'allowance', 'Coordinate assessment or testing by a qualified provider where suspect materials may be disturbed. Testing scope, samples, reports, scheduling, and fees must be confirmed before use.', ALL_ROOM_TYPES, [], { aliases: ['asbestos testing', 'hazmat assessment', 'lead testing'] }),
        entry('hazmat.abatement_coordination', 'hazmat', 'Hazardous Material Abatement Coordination', 'allowance', 'Coordinate separately authorized hazardous-material handling or abatement by qualified providers. Final scope, containment, disposal, clearance requirements, and pricing remain subject to the assessment results.', ALL_ROOM_TYPES, [], { aliases: ['asbestos abatement', 'hazmat removal'] }),

        entry('site.excavation', 'sitework_landscaping', 'Excavation and Material Handling', 'Flatrate', 'Excavate the identified area to the required project elevations and stage or remove material as agreed. Confirm soil conditions, unsuitable material, imported fill, access, and haul-off before finalizing.', ['site_landscaping', 'patio_hardscape', 'deck_porch', 'fence_gate'], ['site_excavation', 'hardscape_excavation'], { aliases: ['excavation', 'digging', 'soil removal'] }),
        entry('site.grading_drainage', 'sitework_landscaping', 'Site Grading and Drainage', 'sq ft', 'Shape and compact the identified area to the agreed finished grades and drainage direction. Confirm tie-ins, swales, erosion control, drainage structures, and restoration limits.', ['site_landscaping', 'patio_hardscape'], ['site_grading', 'hardscape_drainage'], { aliases: ['grading', 'drainage', 'rough grade'] }),
        entry('site.granular_base', 'sitework_landscaping', 'Granular Base Preparation', 'sq ft', 'Prepare the identified hardscape area with the specified excavation depth, geotextile where selected, granular material, lift placement, compaction, and final grade.', ['patio_hardscape', 'site_landscaping'], ['hardscape_excavation'], { aliases: ['aggregate base', 'gravel base', 'hardscape base'] }),
        entry('site.soil_hauloff', 'sitework_landscaping', 'Excavated Soil Haul-Off', 'Flatrate', 'Load, transport, and dispose of the agreed excavated soil or unsuitable material. Confirm material classification, trucking access, disposal facility, and tipping charges.', ['site_landscaping', 'patio_hardscape', 'deck_porch', 'fence_gate'], ['site_excavation'], { aliases: ['soil disposal', 'haul off', 'dirt removal'] }),
        entry('site.landscape_restoration', 'sitework_landscaping', 'Landscape Restoration', 'sq ft', 'Restore the identified disturbed landscape area with the selected topsoil, seed, sod, mulch, or planting work. Confirm irrigation repairs, maintenance, and establishment responsibilities.', ['site_landscaping', 'deck_porch', 'fence_gate', 'patio_hardscape'], ['site_landscape_finish'], { aliases: ['sod restoration', 'topsoil and seed', 'landscape repair'] }),
        entry('site.fence_posts', 'sitework_landscaping', 'Fence Post Installation', 'each', 'Lay out and install the selected fence posts at the agreed locations, alignment, depth, and spacing. Confirm excavation conditions, concrete or backfill method, utilities, and property-line information.', ['fence_gate'], ['fence_posts'], { aliases: ['fence posts', 'post holes'] }),

        entry('concrete.footings', 'concrete_masonry', 'Concrete Footing Installation', 'each', 'Form and place the identified concrete footings to the approved project dimensions. Confirm excavation, reinforcement, bearing conditions, inspection, weather protection, and cure requirements.', ['deck_porch', 'patio_hardscape', 'site_landscaping', 'general_other'], [], { aliases: ['footings', 'concrete piers', 'deck footings'] }),
        entry('concrete.slab', 'concrete_masonry', 'Concrete Slab Installation', 'sq ft', 'Prepare, form, reinforce, place, finish, and cure the identified concrete slab using the selected assembly. Confirm base, thickness, reinforcement, joints, edges, access, and finish requirements.', ['patio_hardscape', 'garage_workshop', 'basement_utility', 'general_other'], [], { aliases: ['concrete pad', 'concrete slab'] }),
        entry('concrete.pavers', 'concrete_masonry', 'Paver Installation', 'sq ft', 'Install the selected paver system over the prepared base, including layout, cuts, bedding, joints, compaction, and agreed edge restraint. Confirm pattern and specialty pieces before use.', ['patio_hardscape'], ['hardscape_pavers'], { aliases: ['interlock', 'paving stones', 'patio pavers'] }),
        entry('concrete.steps_walls', 'concrete_masonry', 'Hardscape Steps and Retaining Work', 'Flatrate', 'Construct the identified hardscape steps, landings, retaining edges, or wall sections using the selected system. Confirm dimensions, drainage, caps, guards, and transitions separately.', ['patio_hardscape', 'site_landscaping'], ['hardscape_steps_walls'], { aliases: ['retaining wall', 'landscape steps', 'wall caps'] }),

        entry('framing.interior_walls', 'framing_structural', 'Interior Wall Framing', 'LF', 'Lay out and frame the identified interior walls, openings, backing, and service clearances using the selected assembly. Confirm structural, fire, acoustic, and ceiling-interface requirements.', ['basement_utility', 'bedroom', 'living_area', 'office', 'whole_floor', 'general_other'], ['basement_framing'], { aliases: ['wall framing', 'partition framing'] }),
        entry('framing.bulkheads_backing', 'framing_structural', 'Bulkhead, Blocking, and Backing', 'LF', 'Frame the identified bulkheads and install required blocking or backing for fixtures, cabinets, rails, accessories, or finishes. Confirm locations with affected trades before walls are closed.', INTERIOR_ROOMS, ['basement_framing'], { aliases: ['bulkhead framing', 'blocking', 'backing'] }),
        entry('framing.deck_structure', 'framing_structural', 'Deck Structural Framing', 'sq ft', 'Construct the selected deck framing assembly, including the agreed beams, joists, ledgers, posts, connections, blocking, and structural hardware. Confirm foundation and permit requirements separately.', ['deck_porch'], ['deck_structure'], { aliases: ['deck framing', 'porch framing'] }),
        entry('framing.stairs', 'framing_structural', 'Stair Structural Framing', 'Flatrate', 'Lay out and construct or modify the identified stair structure and landings to the approved project geometry. Confirm openings, headroom, support, guards, and finish interfaces before use.', ['stairs_landing'], ['stairs_structure'], { aliases: ['stair framing', 'staircase structure'] }),

        entry('roof.underlayment_flashing', 'roofing', 'Roof Underlayment and Flashing', 'sq ft', 'Install the selected roof underlayment, eave and valley protection, and required flashing components over an accepted substrate. Confirm transitions, penetrations, and manufacturer details.', ['roof'], ['roof_underlayment'], { aliases: ['roof membrane', 'ice and water shield', 'roof flashing'] }),
        entry('roof.covering', 'roofing', 'Roof Covering Installation', 'sq ft', 'Install the selected roof covering system with the required starter, field, ridge, hip, and termination components. Confirm product, colour, layout, ventilation, and warranty requirements.', ['roof'], ['roof_covering'], { aliases: ['shingle installation', 'metal roofing', 'roof installation'] }),
        entry('roof.ventilation', 'roofing', 'Roof Ventilation', 'each', 'Install or modify the identified roof ventilation components and integrate them with the selected roof system. Confirm intake, exhaust, insulation clearances, and existing ventilation conditions.', ['roof'], ['roof_ventilation'], { aliases: ['roof vents', 'ridge vent', 'attic ventilation'] }),
        entry('roof.repairs', 'roofing', 'Roof Deck Repair Allowance', 'allowance', 'Provide an allowance for separately approved repair of deteriorated roof decking discovered after removal. Confirm measurement, authorization, unit basis, and documentation before work proceeds.', ['roof'], [], { aliases: ['roof sheathing repair', 'deck replacement allowance'] }),

        entry('exterior.weather_barrier', 'exterior_envelope', 'Exterior Weather Barrier and Flashing', 'sq ft', 'Install the selected weather-resistive barrier, flashings, tapes, and transition details at the identified exterior area. Confirm tie-ins to openings, roofs, foundations, and existing assemblies.', ['exterior_envelope'], ['exterior_weather_barrier'], { aliases: ['house wrap', 'weather barrier', 'flashing membrane'] }),
        entry('exterior.cladding', 'exterior_envelope', 'Exterior Cladding Installation', 'sq ft', 'Install the selected exterior cladding system with the agreed starter, corners, trims, ventilation space, fasteners, and finish details. Confirm substrate readiness and transitions.', ['exterior_envelope'], ['exterior_cladding'], { aliases: ['siding installation', 'exterior cladding'] }),
        entry('exterior.window', 'exterior_envelope', 'Window Installation', 'each', 'Remove or prepare the identified opening and install the selected window with agreed shimming, fastening, air sealing, flashing, and interior or exterior finishing. Confirm product and opening conditions.', ['exterior_envelope', 'whole_floor'], ['exterior_openings'], { aliases: ['replacement window', 'new window install'] }),
        entry('exterior.door', 'exterior_envelope', 'Exterior Door Installation', 'each', 'Prepare the identified opening and install the selected exterior door assembly with agreed shimming, fastening, air sealing, flashing, hardware, and trim. Confirm sill and threshold conditions.', ['exterior_envelope', 'garage_workshop', 'deck_porch'], ['exterior_openings', 'garage_door_envelope'], { aliases: ['entry door', 'patio door', 'exterior door'] }),
        entry('exterior.gutters', 'exterior_envelope', 'Eavestrough and Downspout Installation', 'LF', 'Install the selected eavestrough, outlets, downspouts, elbows, and discharge extensions at the identified roof edges. Confirm drainage destinations and fascia condition.', ['roof', 'exterior_envelope'], ['roof_gutters'], { aliases: ['gutters', 'eavestrough', 'downspouts'] }),

        entry('waterproofing.shower', 'waterproofing', 'Shower and Wet-Area Waterproofing', 'sq ft', 'Prepare and waterproof the identified wet-area surfaces with the selected compatible system, including agreed seams, corners, penetrations, transitions, and testing requirements.', ['full_bathroom'], ['bath_wet_area_waterproofing'], { aliases: ['shower membrane', 'wet area waterproofing'] }),
        entry('waterproofing.basement', 'waterproofing', 'Basement Moisture Management', 'Flatrate', 'Address the identified below-grade moisture condition using the selected repair or water-management scope. Confirm investigation limits, crack repairs, drainage, sump, and finish compatibility.', ['basement_utility'], ['basement_moisture'], { aliases: ['foundation waterproofing', 'basement moisture', 'crack repair'] }),
        entry('waterproofing.deck', 'waterproofing', 'Deck Water-Management System', 'sq ft', 'Install the selected deck or balcony water-management assembly and coordinate all laps, edges, penetrations, drains, flashings, and wall or door transitions.', ['deck_porch'], ['deck_water_management'], { aliases: ['deck membrane', 'under deck drainage', 'balcony waterproofing'] }),

        entry('plumbing.bath_rough', 'plumbing', 'Bathroom Plumbing Rough-In', 'Flatrate', 'Lay out and install the agreed water, drain, waste, and vent rough-ins for the selected bathroom fixtures. Final locations, fixture specifications, access, and testing requirements must be confirmed.', ['full_bathroom', 'powder_room'], ['bath_plumbing_rough'], { phases: ['rough_in'], aliases: ['bathroom rough plumbing', 'bath rough in'] }),
        entry('plumbing.kitchen_rough', 'plumbing', 'Kitchen Plumbing Rough-In', 'Flatrate', 'Lay out and install the agreed kitchen water, drain, vent, dishwasher, refrigerator, and selected appliance rough-ins. Confirm the final cabinet and appliance plan before use.', ['kitchen'], ['kitchen_plumbing_rough'], { phases: ['rough_in'], aliases: ['kitchen rough plumbing'] }),
        entry('plumbing.laundry_rough', 'plumbing', 'Laundry Plumbing Rough-In', 'Flatrate', 'Install the agreed washer supplies, shutoffs, drain, standpipe, venting, and selected laundry-sink rough-ins. Confirm appliance and cabinet locations before closing walls.', ['laundry_mudroom'], ['laundry_plumbing_rough'], { phases: ['rough_in'], aliases: ['washer box', 'laundry rough plumbing'] }),
        entry('plumbing.toilet', 'plumbing', 'Toilet Installation', 'each', 'Set, connect, secure, and test the selected toilet at the prepared location. Confirm fixture supply, flange condition, shutoff, seat, disposal, and repair responsibilities.', ['full_bathroom', 'powder_room'], ['bath_toilet'], { phases: ['finish'], aliases: ['water closet installation'] }),
        entry('plumbing.vanity', 'plumbing', 'Vanity Sink and Faucet Connections', 'each', 'Install and connect the selected sink, faucet, drain assembly, trap, supplies, and shutoffs at the prepared vanity location. Confirm fixture and countertop responsibilities.', ['full_bathroom', 'powder_room'], ['bath_vanity_plumbing'], { phases: ['finish'], aliases: ['bathroom sink', 'vanity plumbing'] }),
        entry('plumbing.shower_tub', 'plumbing', 'Shower or Tub Fixture Installation', 'each', 'Install and connect the selected shower, tub, valve, trim, drain, and related fixture components at prepared rough-in locations. Confirm fixture supply and specialty accessories.', ['full_bathroom'], ['bath_bathing_fixture'], { phases: ['finish'], aliases: ['tub installation', 'shower fixture installation'] }),
        entry('plumbing.kitchen_sink', 'plumbing', 'Kitchen Sink and Faucet Connections', 'each', 'Install and connect the selected kitchen sink, faucet, drain assembly, trap, supplies, shutoffs, and agreed accessories. Confirm countertop cutout and appliance connections separately.', ['kitchen'], ['kitchen_sink_faucet'], { phases: ['finish'], aliases: ['kitchen faucet', 'sink plumbing'] }),
        entry('plumbing.laundry_finish', 'plumbing', 'Laundry Fixture and Appliance Connections', 'Flatrate', 'Complete the agreed washer, laundry-sink, hose, drain, shutoff, and fixture connections and test for normal operation. Confirm appliance placement and owner-supplied components.', ['laundry_mudroom'], ['laundry_plumbing_finish'], { phases: ['finish'], aliases: ['washer hookup', 'laundry connections'] }),

        entry('electrical.rough_room', 'electrical', 'Room Electrical Rough-In', 'Flatrate', 'Lay out and install the agreed wiring, boxes, feeds, and rough-in components for lighting, switching, receptacles, and selected equipment. Confirm the final device layout before closing walls.', LIVING_ROOMS, ['room_electrical_rough'], { phases: ['rough_in'], aliases: ['rough electrical', 'room wiring'] }),
        entry('electrical.rough_kitchen', 'electrical', 'Kitchen Electrical Rough-In', 'Flatrate', 'Install the agreed kitchen wiring, boxes, appliance circuits, countertop circuits, lighting feeds, and control rough-ins. Confirm cabinet, appliance, and lighting plans before use.', ['kitchen'], ['kitchen_electrical_rough'], { phases: ['rough_in'], aliases: ['kitchen wiring', 'kitchen rough electrical'] }),
        entry('electrical.rough_basement', 'electrical', 'Basement Electrical Rough-In', 'Flatrate', 'Install the agreed basement wiring, boxes, circuits, lighting feeds, receptacle feeds, and equipment rough-ins for the selected layout. Confirm service capacity and final plans separately.', ['basement_utility'], ['basement_electrical'], { phases: ['rough_in'], aliases: ['basement wiring'] }),
        entry('electrical.recessed_light', 'electrical', 'Recessed Light Installation', 'each', 'Install and connect the selected recessed light at the prepared location, including the agreed housing, trim, lamp or integrated fixture, wiring connection, and testing.', INTERIOR_ROOMS, ['bath_lighting', 'kitchen_lighting_devices', 'room_lighting_devices', 'stairs_lighting'], { phases: ['finish'], aliases: ['pot light', 'recessed lighting'] }),
        entry('electrical.light_fixture', 'electrical', 'Light Fixture Installation', 'each', 'Install, connect, secure, and test the selected light fixture at a prepared electrical box. Confirm fixture supply, assembly, mounting support, controls, and specialty access.', INTERIOR_ROOMS, ['bath_lighting', 'kitchen_lighting_devices', 'room_lighting_devices', 'stairs_lighting'], { phases: ['finish'], aliases: ['ceiling light', 'vanity light', 'lighting fixture'] }),
        entry('electrical.devices', 'electrical', 'Switch and Receptacle Installation', 'each', 'Install, connect, label where required, and test the selected switch, dimmer, receptacle, or related device at a prepared box. Confirm device type, finish, and control compatibility.', INTERIOR_ROOMS, ['bath_devices', 'kitchen_lighting_devices', 'room_lighting_devices', 'laundry_electrical', 'garage_electrical'], { phases: ['finish'], aliases: ['outlet', 'receptacle', 'switch', 'dimmer'] }),
        entry('electrical.dedicated_circuit', 'electrical', 'Dedicated Circuit Installation', 'each', 'Install the agreed dedicated branch circuit between the distribution equipment and prepared equipment location. Confirm load, routing, breaker space, disconnects, and final connection requirements.', ['kitchen', 'laundry_mudroom', 'basement_utility', 'garage_workshop', 'general_other'], ['laundry_electrical', 'garage_electrical'], { phases: ['rough_in'], aliases: ['new circuit', 'appliance circuit'] }),
        entry('electrical.exterior_deck', 'electrical', 'Exterior or Deck Electrical Work', 'Flatrate', 'Install the agreed exterior wiring, boxes, fixtures, receptacles, and controls using components suitable for the selected location. Confirm routes, switching, and fixture supply.', ['deck_porch', 'exterior_envelope', 'patio_hardscape'], ['deck_electrical'], { phases: ['rough_in', 'finish'], aliases: ['deck lighting', 'outdoor receptacle', 'exterior lighting'] }),

        entry('hvac.bath_exhaust', 'hvac_ventilation', 'Bathroom Exhaust Fan and Duct', 'each', 'Install the selected bathroom exhaust fan and complete the agreed duct route, exterior termination, controls, and testing. Confirm electrical connection and access responsibilities.', ['full_bathroom', 'powder_room'], ['bath_exhaust'], { aliases: ['bath fan', 'bathroom ventilation'] }),
        entry('hvac.range_hood', 'hvac_ventilation', 'Range Hood Exhaust Duct', 'each', 'Install or modify the agreed range-hood exhaust duct and exterior termination for the selected appliance location. Confirm appliance connection, route, access, and make-up-air responsibilities.', ['kitchen'], ['kitchen_ventilation'], { aliases: ['hood fan duct', 'kitchen exhaust'] }),
        entry('hvac.supply_return', 'hvac_ventilation', 'Supply and Return Air Modification', 'each', 'Relocate, extend, or install the identified supply or return-air run and finish with the selected register or grille. Confirm system capacity, balancing, and access separately.', LIVING_ROOMS.concat(['basement_utility']), ['room_hvac', 'basement_hvac'], { aliases: ['duct relocation', 'supply register', 'return air'] }),
        entry('hvac.dryer_vent', 'hvac_ventilation', 'Dryer Exhaust Installation', 'each', 'Install the agreed dryer exhaust duct, fittings, exterior termination, and final appliance connection using the selected route. Confirm access, cleaning provisions, and appliance location.', ['laundry_mudroom'], ['laundry_vent'], { aliases: ['dryer duct', 'dryer vent'] }),
        entry('hvac.startup_balance', 'hvac_ventilation', 'HVAC Startup and Balancing', 'Flatrate', 'Complete the agreed equipment startup, control setup, operational checks, and air-distribution adjustments. Confirm manufacturer attendance and formal balancing requirements separately.', ['basement_utility', 'whole_floor', 'general_other'], [], { aliases: ['commissioning', 'air balancing', 'hvac startup'] }),

        entry('insulation.batt', 'insulation', 'Batt Insulation Installation', 'sq ft', 'Install the selected batt insulation in the identified wall, ceiling, or floor cavities with careful fitting around services and framing. Confirm thermal, acoustic, vapour, and fire requirements.', ['basement_utility', 'garage_workshop', 'whole_floor', 'exterior_envelope', 'general_other'], ['basement_insulation', 'garage_insulation'], { aliases: ['fiberglass insulation', 'mineral wool'] }),
        entry('insulation.air_sealing', 'insulation', 'Air Sealing', 'Flatrate', 'Seal the identified penetrations, gaps, rim areas, and assembly transitions using compatible materials before finishes are installed. Confirm testing and concealed-access limits.', ['basement_utility', 'garage_workshop', 'whole_floor', 'exterior_envelope', 'roof'], ['basement_insulation'], { aliases: ['draft sealing', 'rim joist sealing'] }),
        entry('insulation.sound', 'insulation', 'Acoustic Insulation', 'sq ft', 'Install the selected acoustic insulation in the identified wall, ceiling, or floor cavities. Confirm assembly, coverage, service coordination, and expected performance limitations.', INTERIOR_ROOMS, [], { aliases: ['sound insulation', 'soundproofing batts'] }),

        entry('drywall.install_finish', 'drywall', 'Drywall Installation and Finishing', 'sq ft', 'Install the selected gypsum board and complete the agreed taping, corner treatment, fastener finishing, sanding, and finish level ready for the specified next finish.', LIVING_ROOMS.concat(['basement_utility', 'garage_workshop']), ['room_drywall', 'basement_drywall', 'garage_drywall'], { aliases: ['hang and finish drywall', 'board and tape'] }),
        entry('drywall.bathroom', 'drywall', 'Bathroom Drywall and Finishing', 'sq ft', 'Install and finish the selected wall or ceiling board outside designated wet-area substrate locations. Confirm moisture-resistant board, repairs, transitions, and finish level.', ['full_bathroom', 'powder_room'], ['bath_drywall'], { aliases: ['moisture resistant drywall', 'bathroom board'] }),
        entry('drywall.kitchen', 'drywall', 'Kitchen Drywall Repairs and Finishing', 'Flatrate', 'Repair and finish the identified kitchen wall and ceiling areas affected by cabinet, backsplash, electrical, plumbing, or demolition work. Confirm final exposed areas and finish level.', ['kitchen'], ['kitchen_drywall'], { aliases: ['kitchen drywall repair', 'cabinet removal patching'] }),
        entry('drywall.laundry', 'drywall', 'Laundry Drywall Repairs and Finishing', 'Flatrate', 'Repair and finish the identified laundry wall or ceiling areas affected by service and equipment work. Confirm moisture conditions, access panels, and final finish requirements.', ['laundry_mudroom'], ['laundry_finishes'], { aliases: ['laundry drywall', 'utility wall patching'] }),
        entry('drywall.patch', 'drywall', 'Drywall Patching and Repair', 'Flatrate', 'Patch and finish the identified openings, damage, or disturbed areas to blend with the agreed surrounding finish. Painting, texture matching, and concealed damage are confirmed separately.', INTERIOR_ROOMS, ['room_drywall'], { aliases: ['wall repair', 'ceiling repair', 'drywall patch'] }),

        entry('tile.substrate', 'tile_stone', 'Tile Substrate Preparation', 'sq ft', 'Prepare the identified surface for tile using the selected backer board, underlayment, uncoupling, levelling, or repair scope. Confirm waterproofing and substrate acceptance separately.', ['full_bathroom', 'powder_room', 'kitchen', 'laundry_mudroom'], ['bath_tile_substrate'], { aliases: ['tile prep', 'cement board', 'uncoupling membrane'] }),
        entry('tile.shower_walls', 'tile_stone', 'Shower Wall Tile Installation', 'sq ft', 'Install the selected shower wall tile over an accepted waterproofed substrate, including layout, cuts, setting, grout, and agreed exposed-edge treatment. Confirm niches and specialty patterns.', ['full_bathroom'], ['bath_tile_finish'], { aliases: ['shower tile', 'tub surround tile'] }),
        entry('tile.floor', 'tile_stone', 'Floor Tile Installation', 'sq ft', 'Install the selected floor tile over an accepted prepared substrate, including layout, cuts, setting, grout, and agreed movement, edge, and transition details.', ['full_bathroom', 'powder_room', 'kitchen', 'laundry_mudroom', 'hallway_entry'], ['bath_tile_finish', 'kitchen_flooring'], { aliases: ['tile floor', 'porcelain tile installation'] }),
        entry('tile.backsplash', 'tile_stone', 'Backsplash Tile Installation', 'sq ft', 'Prepare and install the selected backsplash tile, including layout, cuts, setting, grout, sealant, and agreed exposed-edge finishing. Confirm outlets and specialty details.', ['kitchen', 'laundry_mudroom', 'full_bathroom'], ['kitchen_backsplash'], { aliases: ['kitchen backsplash', 'wall tile'] }),

        entry('flooring.subfloor_prep', 'flooring', 'Subfloor Preparation and Levelling', 'sq ft', 'Inspect and prepare the identified subfloor for the selected finish, including agreed fastening, patching, levelling, sanding, or localized repair. Confirm moisture and structural repairs separately.', INTERIOR_ROOMS, ['bath_floor_prep', 'room_floor_prep', 'kitchen_flooring', 'laundry_flooring', 'basement_flooring', 'garage_floor'], { aliases: ['floor prep', 'subfloor repair', 'floor leveling'] }),
        entry('flooring.underlayment', 'flooring', 'Flooring Underlayment Installation', 'sq ft', 'Install the selected underlayment or moisture-control layer over an accepted substrate in accordance with the chosen flooring system. Confirm seams, transitions, and compatibility.', INTERIOR_ROOMS, ['room_floor_prep', 'bath_floor_prep', 'basement_flooring'], { aliases: ['underpad', 'moisture barrier', 'floor membrane'] }),
        entry('flooring.finish_install', 'flooring', 'Finish Flooring Installation', 'sq ft', 'Install the selected finish flooring over an accepted prepared substrate, including layout, cuts, fitting, and normal perimeter detailing. Confirm pattern, waste, and product-specific requirements.', INTERIOR_ROOMS, ['kitchen_flooring', 'laundry_flooring', 'basement_flooring', 'garage_floor'], { aliases: ['hardwood installation', 'vinyl plank', 'laminate installation'] }),
        entry('flooring.transitions', 'flooring', 'Flooring Transitions and Edge Profiles', 'each', 'Supply and install the selected threshold, reducer, transition, edge profile, or nosing at the identified location. Confirm adjacent finish heights, colour, and fastening method.', INTERIOR_ROOMS, ['room_floor_transitions'], { aliases: ['floor transition', 'threshold', 'reducer'] }),
        entry('flooring.perimeter_trim', 'flooring', 'Flooring Perimeter Trim', 'LF', 'Install or reinstall the selected shoe moulding, quarter round, or related perimeter trim after flooring work. Confirm baseboard handling, finish, caulking, and painting separately.', INTERIOR_ROOMS, ['room_floor_trim'], { aliases: ['shoe moulding', 'quarter round', 'floor trim'] }),
        entry('flooring.removal_disposal', 'flooring', 'Existing Flooring Removal and Disposal', 'sq ft', 'Remove the identified existing flooring and agreed underlayment, then stage, haul, and dispose of debris. Confirm adhesives, multiple layers, hazardous materials, and subfloor repairs separately.', INTERIOR_ROOMS, ['room_floor_removal_disposal'], { aliases: ['floor removal', 'remove and dispose flooring'] }),
        entry('flooring.stair_treads', 'flooring', 'Stair Tread, Riser, and Nosing Installation', 'each', 'Install the selected tread, riser, nosing, or stair finish components over an accepted structure. Confirm templates, returns, landings, transitions, and finish requirements.', ['stairs_landing'], ['stairs_treads_nosings'], { aliases: ['stair treads', 'stair nosing', 'riser installation'] }),

        entry('cabinets.kitchen', 'cabinets_vanities', 'Kitchen Cabinet Installation', 'Flatrate', 'Lay out, level, secure, and adjust the selected kitchen cabinets, including agreed fillers, panels, toe kicks, and hardware. Confirm appliance panels and specialty trim separately.', ['kitchen'], ['kitchen_cabinets'], { aliases: ['cabinet install', 'base and upper cabinets'] }),
        entry('cabinets.vanity', 'cabinets_vanities', 'Bathroom Vanity Installation', 'each', 'Position, level, secure, and adjust the selected vanity, including agreed fillers, panels, hardware, and wall attachment. Plumbing and countertop connections are confirmed separately.', ['full_bathroom', 'powder_room'], ['bath_vanity_cabinet'], { aliases: ['bathroom vanity', 'vanity cabinet'] }),
        entry('cabinets.countertop', 'cabinets_vanities', 'Countertop Supply and Installation', 'sq ft', 'Coordinate field measurement and install the selected countertop with the agreed edges, seams, cutouts, supports, and finish details. Confirm material, fabrication, and plumbing disconnects.', ['kitchen', 'full_bathroom', 'powder_room', 'laundry_mudroom'], ['kitchen_countertops', 'bath_vanity_cabinet'], { aliases: ['quartz countertop', 'counter top'] }),
        entry('cabinets.laundry', 'cabinets_vanities', 'Laundry Cabinet and Counter Installation', 'Flatrate', 'Install the selected laundry cabinets, shelves, or countertop, including agreed fillers, panels, hardware, and wall attachment. Confirm appliance clearances and service access.', ['laundry_mudroom'], ['laundry_cabinets'], { aliases: ['laundry cabinets', 'laundry countertop'] }),
        entry('cabinets.finish_panels', 'cabinets_vanities', 'Cabinet Finish Panels, Fillers, and Hardware', 'Flatrate', 'Install and adjust the identified cabinet finish panels, fillers, toe kicks, mouldings, handles, and related finishing pieces. Confirm final selections and field-fitting requirements.', ['kitchen', 'full_bathroom', 'powder_room', 'laundry_mudroom', 'office'], ['kitchen_cabinets', 'bath_vanity_cabinet', 'laundry_cabinets'], { aliases: ['cabinet fillers', 'cabinet hardware', 'toe kick'] }),

        entry('trim.interior_door', 'interior_doors_trim', 'Interior Door Installation', 'each', 'Install and adjust the selected interior door and agreed frame or jamb components, including normal shimming, fastening, and hardware preparation. Confirm casing, finishing, and specialty hardware.', INTERIOR_ROOMS, ['bath_trim', 'room_doors_trim'], { aliases: ['door slab', 'prehung door', 'interior door'] }),
        entry('trim.casing', 'interior_doors_trim', 'Door and Window Casing Installation', 'LF', 'Measure, cut, fit, fasten, and finish the selected casing at the identified openings. Confirm profile, returns, extensions, caulking, filling, and painting separately.', INTERIOR_ROOMS, ['bath_trim', 'room_doors_trim', 'kitchen_trim'], { aliases: ['trim openings', 'door casing', 'window casing'] }),
        entry('trim.baseboard', 'interior_doors_trim', 'Baseboard Installation', 'LF', 'Measure, cut, fit, and fasten the selected baseboard through the identified areas. Confirm profile, transitions, returns, filling, caulking, and painting separately.', INTERIOR_ROOMS, ['bath_trim', 'room_doors_trim', 'kitchen_trim'], { aliases: ['baseboards', 'base trim'] }),
        entry('trim.deck_surface', 'interior_doors_trim', 'Decking and Fascia Installation', 'sq ft', 'Install the selected deck surface and agreed fascia or picture-frame details over an accepted structure. Confirm board layout, fastening system, stairs, waste, and perimeter details.', ['deck_porch'], ['deck_surface'], { aliases: ['deck boards', 'composite decking', 'deck fascia'] }),
        entry('trim.fence_panels', 'interior_doors_trim', 'Fence Panel or Board Installation', 'LF', 'Install the selected fence rails, panels, or boards between accepted posts with the agreed spacing, alignment, fastening, and top detail. Confirm finish and site transitions.', ['fence_gate'], ['fence_panels'], { aliases: ['fence boards', 'privacy fence', 'fence panels'] }),

        entry('painting.walls', 'painting', 'Wall Preparation and Painting', 'sq ft', 'Prepare and paint the identified wall surfaces using the selected coating system. Confirm repairs, primer requirements, colour, sheen, coat count, masking, and excluded surfaces before use.', INTERIOR_ROOMS, ['room_paint_walls', 'bath_paint', 'kitchen_paint', 'laundry_paint'], { aliases: ['paint walls', 'interior wall painting'] }),
        entry('painting.ceilings', 'painting', 'Ceiling Preparation and Painting', 'sq ft', 'Prepare and paint the identified ceiling surfaces using the selected coating system. Confirm repairs, stains, primer, texture, colour, coat count, and access requirements.', INTERIOR_ROOMS, ['room_paint_ceiling', 'bath_paint', 'kitchen_paint', 'laundry_paint'], { aliases: ['paint ceilings', 'ceiling paint'] }),
        entry('painting.trim_doors', 'painting', 'Trim and Door Painting', 'LF', 'Prepare and paint the identified baseboards, casing, doors, or other trim using the selected coating system. Confirm filling, caulking, primer, sheen, coat count, and hardware handling.', INTERIOR_ROOMS, ['room_paint_trim', 'bath_paint', 'kitchen_paint', 'laundry_paint', 'stairs_finishes'], { aliases: ['paint trim', 'paint doors', 'baseboard painting'] }),
        entry('painting.primer', 'painting', 'Primer and Sealer Application', 'sq ft', 'Apply the selected primer or sealer to the identified new, repaired, bare, stained, or colour-change surfaces. Confirm product compatibility, coverage, and finish-coat responsibilities.', INTERIOR_ROOMS, ['room_paint_primer'], { aliases: ['prime walls', 'stain blocking primer', 'sealer'] }),
        entry('painting.protection', 'painting', 'Painting Masking and Protection', 'Flatrate', 'Mask and protect the agreed floors, fixtures, furniture, and adjacent surfaces during painting work, then remove temporary protection and related debris on completion.', INTERIOR_ROOMS, ['room_paint_protection'], { aliases: ['masking', 'drop cloths', 'paint protection'] }),
        entry('painting.exterior', 'painting', 'Exterior Surface Preparation and Painting', 'sq ft', 'Prepare and coat the identified exterior surfaces using the selected compatible system. Confirm washing, scraping, repairs, primer, colour, coat count, access, and weather limitations.', ['exterior_envelope', 'deck_porch', 'fence_gate'], ['exterior_paint'], { aliases: ['exterior painting', 'paint siding', 'paint fence'] }),

        entry('accessories.mirror', 'accessories_hardware', 'Mirror or Medicine Cabinet Installation', 'each', 'Lay out, mount, secure, and level the selected mirror or medicine cabinet at the prepared location. Confirm blocking, wall finish, electrical features, and product supply.', ['full_bathroom', 'powder_room', 'bedroom', 'hallway_entry'], ['bath_mirror'], { aliases: ['bathroom mirror', 'medicine cabinet'] }),
        entry('accessories.bath', 'accessories_hardware', 'Bathroom Accessory Installation', 'each', 'Lay out and securely install the selected towel bar, hook, toilet-paper holder, shelf, or related bathroom accessory. Confirm backing, anchors, locations, and product supply.', ['full_bathroom', 'powder_room'], ['bath_accessories'], { aliases: ['towel bar', 'robe hook', 'toilet paper holder'] }),
        entry('accessories.shelving', 'accessories_hardware', 'Shelving Installation', 'LF', 'Lay out, cut or assemble, level, and securely install the selected shelving and supports at the agreed locations. Confirm backing, loads, finish, and product supply.', ['bedroom', 'office', 'laundry_mudroom', 'garage_workshop', 'basement_utility', 'general_other'], [], { aliases: ['closet shelf', 'wall shelf', 'storage shelving'] }),
        entry('accessories.stair_rail', 'accessories_hardware', 'Stair Handrail and Guard Installation', 'LF', 'Install the selected handrail, guard, posts, balusters, and related hardware at the identified stair or landing. Confirm approved layout, backing, transitions, and finishing.', ['stairs_landing'], ['stairs_rails'], { aliases: ['handrail', 'stair railing', 'guardrail'] }),
        entry('accessories.deck_rail', 'accessories_hardware', 'Deck Railing Installation', 'LF', 'Install the selected deck guard or railing system, including agreed posts, rails, infill, gates, and hardware. Confirm layout, backing, stairs, finish, and permit requirements.', ['deck_porch'], ['deck_rails'], { aliases: ['deck guard', 'porch railing'] }),
        entry('accessories.fence_gate', 'accessories_hardware', 'Fence Gate Installation', 'each', 'Assemble or install the selected fence gate with the agreed posts, framing, hinges, latch, stops, and alignment adjustments. Confirm width, swing, hardware, and finish.', ['fence_gate'], ['fence_gates'], { aliases: ['gate installation', 'fence door'] })
    ];

    var CATALOG_BY_ID = CATALOG.reduce(function indexCatalog(result, item) {
        if (!item.id || result[item.id]) throw new Error('Duplicate starter item id: ' + item.id);
        result[item.id] = item;
        return result;
    }, {});

    function categoryForTrade(tradeId) {
        return CATEGORY_BY_TRADE[String(tradeId || '')] || 'Miscellaneous';
    }

    function getItem(itemId) {
        return CATALOG_BY_ID[String(itemId || '')] || null;
    }

    function flattenSavedItems(database) {
        var result = [];
        var db = database && typeof database === 'object' ? database : {};
        Object.keys(db).forEach(function flattenCategory(category) {
            if (category.indexOf('__') === 0 || !Array.isArray(db[category])) return;
            db[category].forEach(function addSavedItem(item) {
                if (!item || !(item.name || item.description)) return;
                result.push(Object.assign({ category: category }, item));
            });
        });
        return result;
    }

    function findSavedItem(catalogItem, database) {
        if (!catalogItem) return null;
        var items = flattenSavedItems(database);
        var bySource = items.find(function matchingSource(item) {
            return String(item.starterSourceId || '') === catalogItem.id;
        });
        if (bySource) return bySource;
        var categoryKey = normalizeText(catalogItem.category);
        var nameKey = normalizeText(catalogItem.name);
        return items.find(function matchingName(item) {
            return normalizeText(item.category) === categoryKey
                && normalizeText(item.name || item.description) === nameKey;
        }) || null;
    }

    function savedItemForName(name, category, database) {
        var nameKey = normalizeText(name);
        var categoryKey = normalizeText(category);
        if (!nameKey) return null;
        var exact = flattenSavedItems(database).filter(function candidate(item) {
            return normalizeText(item.name || item.description) === nameKey
                && (!categoryKey || normalizeText(item.category) === categoryKey);
        });
        return exact.length === 1 ? exact[0] : null;
    }

    function findingTextMatchScore(finding, catalogItem) {
        finding = finding || {};
        var findingText = normalizeText([
            finding.suggestedItemName,
            finding.suggestedCategory,
            finding.title,
            finding.question,
            finding.suggestedAction
        ].join(' '));
        if (!findingText) return 0;
        var labels = [catalogItem.name].concat(catalogItem.aliases || [])
            .map(normalizeText)
            .filter(Boolean);
        if (labels.some(function exactPhrase(label) {
            return findingText.indexOf(label) !== -1 || label.indexOf(findingText) !== -1;
        })) return 80;
        var findingTokens = findingText.split(' ').filter(function usefulToken(token) {
            return token.length >= 4;
        });
        if (!findingTokens.length) return 0;
        var catalogTokens = normalizeText([
            catalogItem.name,
            catalogItem.category,
            (catalogItem.aliases || []).join(' ')
        ].join(' ')).split(' ');
        var overlap = findingTokens.filter(function matchingToken(token) {
            return catalogTokens.indexOf(token) !== -1;
        }).length;
        var ratio = overlap / Math.min(findingTokens.length, 6);
        return overlap >= 2 && ratio >= 0.34 ? Math.round(45 + (ratio * 25)) : 0;
    }

    function catalogItemToSavedItem(catalogItem, overrides) {
        if (!catalogItem || !getItem(catalogItem.id)) return null;
        overrides = overrides || {};
        var category = compactText(overrides.category || catalogItem.category, 100);
        var name = compactText(overrides.name || catalogItem.name, 140);
        var unitType = compactText(overrides.unitType || catalogItem.unitType, 40);
        var description = compactText(
            overrides.itemDescription !== undefined ? overrides.itemDescription : (overrides.description || catalogItem.description),
            700
        );
        if (!category || !name || !unitType) return null;
        return {
            category: category,
            name: name,
            unitType: unitType,
            rate: 0,
            materialCost: 0,
            priceTbd: true,
            pricingMode: 'tbd',
            supplierUrl: '',
            itemDescription: description,
            starterSourceId: catalogItem.id,
            starterCatalogVersion: VERSION
        };
    }

    function normalizeProfile(value, options) {
        value = value && typeof value === 'object' ? value : {};
        options = options || {};
        var offerStatus = String(value.offerStatus || 'not_seen');
        if (['not_seen', 'opened', 'dismissed', 'completed'].indexOf(offerStatus) === -1) offerStatus = 'not_seen';
        var suggestOutsideDatabase = typeof value.suggestOutsideDatabase === 'boolean'
            ? value.suggestOutsideDatabase
            : options.emptyDatabase === true;
        var events = (Array.isArray(value.events) ? value.events : []).map(function normalizeEvent(event) {
            if (!event || !ALLOWED_ACTIONS[event.action]) return null;
            var starterItemId = compactText(event.starterItemId, 100);
            if (starterItemId && !getItem(starterItemId)) return null;
            var tradeId = compactText(event.tradeId, 80);
            if (tradeId && !knowledge.getTrade(tradeId)) return null;
            var roomType = compactText(event.roomType, 60);
            if (roomType && !knowledge.getRoomType(roomType)) return null;
            return {
                id: compactText(event.id, 140) || ('starter-event-' + Date.now()),
                starterItemId: starterItemId,
                action: event.action,
                tradeId: tradeId,
                roomType: roomType,
                createdAt: compactText(event.createdAt, 40) || new Date().toISOString()
            };
        }).filter(Boolean).slice(-MAX_EVENTS);
        return {
            version: PROFILE_VERSION,
            suggestOutsideDatabase: suggestOutsideDatabase,
            offerStatus: offerStatus,
            events: events,
            updatedAt: compactText(value.updatedAt, 40)
        };
    }

    function recordAction(profileValue, event, options) {
        var profile = normalizeProfile(profileValue, options);
        event = event || {};
        if (!ALLOWED_ACTIONS[event.action]) return profile;
        var starterItemId = compactText(event.starterItemId, 100);
        if (starterItemId && !getItem(starterItemId)) return profile;
        profile.events.push({
            id: compactText(event.id, 140)
                || ('starter-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)),
            starterItemId: starterItemId,
            action: event.action,
            tradeId: knowledge.getTrade(event.tradeId) ? event.tradeId : '',
            roomType: knowledge.getRoomType(event.roomType) ? event.roomType : '',
            createdAt: compactText(event.createdAt, 40) || new Date().toISOString()
        });
        profile.events = profile.events.slice(-MAX_EVENTS);
        profile.updatedAt = new Date().toISOString();
        return profile;
    }

    function learningScore(catalogItem, profileValue, roomType) {
        var profile = normalizeProfile(profileValue);
        return profile.events.reduce(function scoreEvent(total, event) {
            if (event.starterItemId && event.starterItemId !== catalogItem.id) return total;
            if (!event.starterItemId && event.tradeId && event.tradeId !== catalogItem.tradeId) return total;
            var contextMultiplier = event.roomType && roomType && event.roomType === roomType ? 2 : 1;
            if (event.action === 'imported') return total + (5 * contextMultiplier);
            if (event.action === 'saved') return total + (7 * contextMultiplier);
            if (event.action === 'added_to_quote') return total + (9 * contextMultiplier);
            if (event.action === 'dismissed') return total - (5 * contextMultiplier);
            if (event.action === 'handled_by_others') return total - (6 * contextMultiplier);
            if (event.action === 'not_relevant') return total - (10 * contextMultiplier);
            return total;
        }, 0);
    }

    function query(options) {
        options = options || {};
        var tradeId = compactText(options.tradeId, 80);
        var roomType = compactText(options.roomType, 60);
        var phaseId = compactText(options.phaseId, 40);
        var search = normalizeText(options.search);
        return CATALOG.map(function scoreCatalogItem(item) {
            if (tradeId && item.tradeId !== tradeId) return null;
            if (roomType && item.roomTypes.indexOf(roomType) === -1) return null;
            if (phaseId && item.phases.length && item.phases.indexOf(phaseId) === -1) return null;
            var searchText = normalizeText([
                item.name,
                item.category,
                item.description,
                item.aliases.join(' '),
                knowledge.getTrade(item.tradeId) && knowledge.getTrade(item.tradeId).label
            ].join(' '));
            if (search && searchText.indexOf(search) === -1) return null;
            var score = learningScore(item, options.profile, roomType);
            if (tradeId) score += 40;
            if (roomType) score += 25;
            if (phaseId && item.phases.indexOf(phaseId) !== -1) score += 10;
            return Object.assign({}, item, {
                score: score,
                savedItem: findSavedItem(item, options.database)
            });
        }).filter(Boolean).sort(function catalogOrder(a, b) {
            return b.score - a.score
                || a.category.localeCompare(b.category)
                || a.name.localeCompare(b.name);
        });
    }

    function findForFinding(finding, database, profile) {
        finding = finding || {};
        var knowledgeKey = compactText(finding.knowledgeKey, 100);
        var tradeId = compactText(finding.tradeId, 80);
        var roomType = compactText(finding.roomType, 60);
        var phaseId = compactText(finding.phaseId, 40);
        var candidates = CATALOG.map(function scoreCandidate(item) {
            if (tradeId && item.tradeId !== tradeId) return null;
            if (roomType && item.roomTypes.indexOf(roomType) === -1) return null;
            if (phaseId && item.phases.length && item.phases.indexOf(phaseId) === -1) return null;
            var exactKnowledge = knowledgeKey && item.knowledgeKeys.indexOf(knowledgeKey) !== -1;
            var textMatchScore = findingTextMatchScore(finding, item);
            if (!exactKnowledge && !textMatchScore) return null;
            var score = learningScore(item, profile, roomType)
                + (exactKnowledge ? 120 : 0)
                + textMatchScore
                + (tradeId && item.tradeId === tradeId ? 30 : 0)
                + (roomType && item.roomTypes.indexOf(roomType) !== -1 ? 20 : 0)
                + (phaseId && item.phases.indexOf(phaseId) !== -1 ? 10 : 0);
            return Object.assign({}, item, {
                score: score,
                exactKnowledge: exactKnowledge,
                savedItem: findSavedItem(item, database)
            });
        }).filter(Boolean).sort(function candidateOrder(a, b) {
            return b.score - a.score || a.name.localeCompare(b.name);
        });
        return candidates[0] || null;
    }

    function savedItemForFinding(finding, database, profile) {
        finding = finding || {};
        var direct = savedItemForName(
            finding.suggestedItemName || finding.targetItemName,
            finding.suggestedCategory,
            database
        );
        if (direct) {
            return {
                savedItem: direct,
                catalogItem: getItem(direct.starterSourceId) || null
            };
        }
        var catalogItem = findForFinding(finding, database, profile);
        return catalogItem && catalogItem.savedItem
            ? { savedItem: catalogItem.savedItem, catalogItem: catalogItem }
            : null;
    }

    function findingSupportsItemAction(finding) {
        finding = finding || {};
        return !!(
            finding.roomId
            && !finding.targetItemName
            && finding.findingKind !== 'coordination'
            && (finding.suggestedItemName || finding.knowledgeKey)
        );
    }

    function resolveFinding(finding, database, profile, options) {
        options = options || {};
        if (!findingSupportsItemAction(finding)) return { kind: 'none' };
        var savedMatch = savedItemForFinding(finding, database, profile);
        if (savedMatch) {
            return {
                kind: 'saved',
                savedItem: savedMatch.savedItem,
                catalogItem: savedMatch.catalogItem
            };
        }
        if (options.suggestOutsideDatabase !== true) return { kind: 'none' };
        var catalogItem = findForFinding(finding, database, profile);
        if (catalogItem) return { kind: 'catalog', catalogItem: catalogItem };
        return { kind: 'draft' };
    }

    function validateGeneratedDraft(value, context) {
        value = value && typeof value === 'object' ? value : {};
        context = context || {};
        var name = compactText(value.name, 140);
        var category = compactText(value.category, 100);
        var unitType = compactText(value.unitType, 40);
        var description = compactText(value.description, 700);
        if (!name || !category || !unitType || !description) return null;
        if (Object.keys(value).some(function unexpectedKey(key) {
            return ['name', 'category', 'unitType', 'description'].indexOf(key) === -1;
        })) return null;
        var combined = [name, category, unitType, description].join(' ');
        if (/[$\u20ac\u00a3]\s*\d|\b(?:price|rate|material cost|markup|discount)\b\s*[:=]?\s*\d/i.test(combined)) return null;
        if (/\b(?:one|two|three|four|five|\d+(?:\.\d+)?)\s+(?:coats?|fixtures?|outlets?|units?|items?|hours?|days?|square feet|sq ft|linear feet|lf|each|sheets?)\b/i.test(description)) return null;
        if (/\b(?:code[- ]compliant|meets? code|required by code|permit approved|inspection approved)\b/i.test(combined)) return null;
        if (COMMON_UNITS.map(normalizeText).indexOf(normalizeText(unitType)) === -1) return null;
        var expectedTrade = compactText(context.tradeId, 80);
        if (expectedTrade && knowledge.getTrade(expectedTrade)) {
            if (normalizeText(category) !== normalizeText(categoryForTrade(expectedTrade))) return null;
        }
        return {
            name: name,
            category: category,
            unitType: unitType,
            description: description,
            rate: 0,
            materialCost: 0,
            priceTbd: true,
            pricingMode: 'tbd',
            source: 'ai_generated'
        };
    }

    function coverage() {
        var trades = {};
        var rooms = {};
        CATALOG.forEach(function countItem(item) {
            trades[item.tradeId] = (trades[item.tradeId] || 0) + 1;
            item.roomTypes.forEach(function countRoom(roomType) {
                rooms[roomType] = (rooms[roomType] || 0) + 1;
            });
        });
        return { trades: trades, rooms: rooms };
    }

    return {
        VERSION: VERSION,
        PROFILE_VERSION: PROFILE_VERSION,
        CATALOG: CATALOG,
        COMMON_UNITS: COMMON_UNITS,
        CATEGORY_BY_TRADE: CATEGORY_BY_TRADE,
        categoryForTrade: categoryForTrade,
        getItem: getItem,
        flattenSavedItems: flattenSavedItems,
        findSavedItem: findSavedItem,
        savedItemForName: savedItemForName,
        catalogItemToSavedItem: catalogItemToSavedItem,
        normalizeProfile: normalizeProfile,
        recordAction: recordAction,
        learningScore: learningScore,
        query: query,
        findForFinding: findForFinding,
        savedItemForFinding: savedItemForFinding,
        findingSupportsItemAction: findingSupportsItemAction,
        resolveFinding: resolveFinding,
        validateGeneratedDraft: validateGeneratedDraft,
        coverage: coverage,
        normalizeText: normalizeText
    };
});
