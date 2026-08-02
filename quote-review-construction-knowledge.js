(function initQuoteDrConstructionKnowledge(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.QuoteDrConstructionKnowledge = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function quoteDrConstructionKnowledgeFactory() {
    'use strict';

    var VERSION = 1;

    function compactText(value, maxLength) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 220);
    }

    function normalizeText(value) {
        return compactText(value, 30000)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function stableTextHash(value) {
        var text = String(value || '');
        var hash = 2166136261;
        for (var index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    var TRADE_GROUPS = [
        {
            label: 'Project and site',
            trades: [
                { id: 'general_conditions', label: 'General Conditions', description: 'Protection, access, cleanup, disposal, permits, and inspections' },
                { id: 'demolition', label: 'Demolition', description: 'Removal, selective demolition, and preparation' },
                { id: 'hazmat', label: 'Asbestos / Hazmat', description: 'Testing, abatement coordination, and hazardous materials' },
                { id: 'sitework_landscaping', label: 'Sitework / Landscaping', description: 'Excavation, grading, drainage, and landscape work' }
            ]
        },
        {
            label: 'Structure and exterior',
            trades: [
                { id: 'concrete_masonry', label: 'Concrete / Masonry', description: 'Footings, slabs, block, brick, and masonry' },
                { id: 'framing_structural', label: 'Framing / Structural', description: 'Rough framing and structural carpentry' },
                { id: 'roofing', label: 'Roofing', description: 'Roof coverings, flashing, and roof ventilation' },
                { id: 'exterior_envelope', label: 'Exterior Envelope', description: 'Windows, exterior doors, siding, weather barrier, and exterior trim' },
                { id: 'waterproofing', label: 'Waterproofing', description: 'Wet-area, foundation, and exterior water management' }
            ]
        },
        {
            label: 'Mechanical',
            trades: [
                {
                    id: 'plumbing',
                    label: 'Plumbing',
                    description: 'Water, drains, vents, and plumbing fixtures',
                    phases: [
                        { id: 'rough_in', label: 'Rough-in' },
                        { id: 'finish', label: 'Finish / fixtures' }
                    ]
                },
                {
                    id: 'electrical',
                    label: 'Electrical',
                    description: 'Wiring, boxes, lighting, devices, and equipment connections',
                    phases: [
                        { id: 'rough_in', label: 'Rough-in' },
                        { id: 'finish', label: 'Lighting / devices' }
                    ]
                },
                { id: 'hvac_ventilation', label: 'HVAC / Ventilation', description: 'Heating, cooling, exhaust, ductwork, and registers' }
            ]
        },
        {
            label: 'Interior finishes',
            trades: [
                { id: 'insulation', label: 'Insulation', description: 'Thermal, acoustic, and air-sealing work' },
                { id: 'drywall', label: 'Drywall', description: 'Board, finishing, repairs, and specialty substrates' },
                { id: 'tile_stone', label: 'Tile / Stone', description: 'Tile, stone, grout, and related preparation' },
                { id: 'flooring', label: 'Flooring', description: 'Finished flooring, preparation, and transitions' },
                { id: 'cabinets_vanities', label: 'Cabinets / Vanities / Countertops', description: 'Cabinetry, vanities, countertops, and related panels' },
                { id: 'interior_doors_trim', label: 'Interior Doors / Trim / Millwork', description: 'Doors, casing, baseboards, trim, and finish carpentry' },
                { id: 'painting', label: 'Painting', description: 'Preparation, primer, walls, ceilings, trim, and coatings' },
                { id: 'accessories_hardware', label: 'Accessories / Hardware', description: 'Mirrors, bath accessories, shelving, rails, and hardware' }
            ]
        }
    ];

    var TRADES = TRADE_GROUPS.reduce(function flattenTrades(result, group) {
        group.trades.forEach(function addTrade(trade) {
            result[trade.id] = trade;
        });
        return result;
    }, {});

    var ROOM_TYPES = [
        { id: 'full_bathroom', label: 'Full Bathroom / Ensuite' },
        { id: 'powder_room', label: 'Powder Room / Half Bath' },
        { id: 'kitchen', label: 'Kitchen' },
        { id: 'bedroom', label: 'Bedroom / Nursery' },
        { id: 'living_area', label: 'Living / Family / Rec / Media Room' },
        { id: 'dining_room', label: 'Dining Room' },
        { id: 'office', label: 'Office' },
        { id: 'hallway_entry', label: 'Hallway / Entry' },
        { id: 'laundry_mudroom', label: 'Laundry / Mudroom' },
        { id: 'basement_utility', label: 'Basement / Utility / Mechanical' },
        { id: 'garage_workshop', label: 'Garage / Workshop' },
        { id: 'stairs_landing', label: 'Stairs / Landing' },
        { id: 'deck_porch', label: 'Deck / Porch / Pergola' },
        { id: 'fence_gate', label: 'Fence / Gate' },
        { id: 'roof', label: 'Roof' },
        { id: 'exterior_envelope', label: 'Exterior Envelope' },
        { id: 'patio_hardscape', label: 'Patio / Hardscape' },
        { id: 'site_landscaping', label: 'Site Preparation / Landscaping' },
        { id: 'whole_floor', label: 'Whole Floor / Mixed Area' },
        { id: 'general_other', label: 'General / Other' }
    ];

    var ROOM_TYPES_BY_ID = ROOM_TYPES.reduce(function indexRoomTypes(result, roomType) {
        result[roomType.id] = roomType;
        return result;
    }, {});

    var ROOM_DETECTION_RULES = [
        { id: 'powder_room', pattern: /\b(powder|half bath|two piece|2 piece|2pc)\b/, confidence: 'high' },
        { id: 'full_bathroom', pattern: /\b(ensuite|en suite|shower room|three piece|four piece|3 piece|4 piece|3pc|4pc)\b/, confidence: 'high' },
        { id: 'full_bathroom', pattern: /\b(bathroom|bath)\b/, confidence: 'ambiguous' },
        { id: 'kitchen', pattern: /\b(kitchen|pantry)\b/, confidence: 'high' },
        { id: 'bedroom', pattern: /\b(bedroom|bed room|nursery|playroom)\b/, confidence: 'high' },
        { id: 'living_area', pattern: /\b(living|family room|den|rec room|recreation|media room|theatre|theater|gym)\b/, confidence: 'high' },
        { id: 'dining_room', pattern: /\b(dining)\b/, confidence: 'high' },
        { id: 'office', pattern: /\b(office|study)\b/, confidence: 'high' },
        { id: 'hallway_entry', pattern: /\b(hall|hallway|corridor|entry|foyer|vestibule)\b/, confidence: 'high' },
        { id: 'laundry_mudroom', pattern: /\b(laundry|mudroom|mud room)\b/, confidence: 'high' },
        { id: 'basement_utility', pattern: /\b(basement|cellar|utility|mechanical|furnace)\b/, confidence: 'high' },
        { id: 'garage_workshop', pattern: /\b(garage|workshop|shop|storage room|commercial)\b/, confidence: 'high' },
        { id: 'stairs_landing', pattern: /\b(stair|stairs|staircase|landing)\b/, confidence: 'high' },
        { id: 'deck_porch', pattern: /\b(deck|porch|veranda|pergola|gazebo)\b/, confidence: 'high' },
        { id: 'fence_gate', pattern: /\b(fence|gate)\b/, confidence: 'high' },
        { id: 'roof', pattern: /\b(roof|roofing)\b/, confidence: 'high' },
        { id: 'exterior_envelope', pattern: /\b(exterior|facade|siding|window|windows|exterior door)\b/, confidence: 'high' },
        { id: 'patio_hardscape', pattern: /\b(patio|hardscape|walkway|driveway|pavers|retaining wall)\b/, confidence: 'high' },
        { id: 'site_landscaping', pattern: /\b(site prep|site preparation|landscape|landscaping|yard|garden|grading|excavation)\b/, confidence: 'high' },
        { id: 'whole_floor', pattern: /\b(whole home|whole house|main floor|ground floor|upper floor|entire floor|addition)\b/, confidence: 'high' }
    ];

    var CATEGORY_RULES = [
        { pattern: /\b(demolition|demo)\b/, tradeId: 'demolition' },
        { pattern: /\b(asbestos|hazmat|hazardous)\b/, tradeId: 'hazmat' },
        { pattern: /\b(sitework|site work|landscape|landscaping|excavation|grading|fence construction)\b/, tradeId: 'sitework_landscaping' },
        { pattern: /\b(concrete|masonry|brick|block|hardscape|paver)\b/, tradeId: 'concrete_masonry' },
        { pattern: /\b(framing|structural|deck construction|deck framing)\b/, tradeId: 'framing_structural' },
        { pattern: /\b(roof|roofing|shingle)\b/, tradeId: 'roofing' },
        { pattern: /\b(window|exterior door|siding|exterior envelope|cladding)\b/, tradeId: 'exterior_envelope' },
        { pattern: /\b(waterproof|water proof|foundation drain|weeping tile)\b/, tradeId: 'waterproofing' },
        { pattern: /\brough plumbing\b/, tradeId: 'plumbing', phases: ['rough_in'] },
        { pattern: /\b(finish plumbing|plumbing fixture|toilet|faucet|sink install|shower valve|tub install)\b/, tradeId: 'plumbing', phases: ['finish'] },
        { pattern: /\b(plumbing|drain|water line)\b/, tradeId: 'plumbing', phases: ['rough_in', 'finish'] },
        { pattern: /\brough electrical\b/, tradeId: 'electrical', phases: ['rough_in'] },
        { pattern: /\b(finish electrical|lighting|light fixture|electrical fixture|receptacle|outlet|switch|pot light)\b/, tradeId: 'electrical', phases: ['finish'] },
        { pattern: /\b(electrical|wiring)\b/, tradeId: 'electrical', phases: ['rough_in', 'finish'] },
        { pattern: /\b(hvac|duct|ventilation|heating|cooling)\b/, tradeId: 'hvac_ventilation' },
        { pattern: /\b(insulation|air seal)\b/, tradeId: 'insulation' },
        { pattern: /\b(drywall|gypsum|wallboard)\b/, tradeId: 'drywall' },
        { pattern: /\b(tile|stone|backsplash)\b/, tradeId: 'tile_stone' },
        { pattern: /\b(flooring|floor finish|hardwood|vinyl|laminate|carpet)\b/, tradeId: 'flooring' },
        { pattern: /\b(cabinet|vanity|countertop|millwork cabinet)\b/, tradeId: 'cabinets_vanities' },
        { pattern: /\b(interior door|trim|millwork|baseboard|finish carpentry|carpentry)\b/, tradeId: 'interior_doors_trim' },
        { pattern: /\b(paint|painting|coating)\b/, tradeId: 'painting' },
        { pattern: /\b(accessor|hardware|mirror|shelving|railing|guardrail)\b/, tradeId: 'accessories_hardware' },
        { pattern: /\b(cleaning|disposal|protection|permit|inspection|general condition)\b/, tradeId: 'general_conditions' }
    ];

    var GENERIC_CATEGORIES = {
        '': true,
        miscellaneous: true,
        misc: true,
        uncategorized: true,
        other: true,
        general: true
    };

    function rule(knowledgeKey, roomTypes, tradeId, phases, title, question, reason, severity, presentAny, extra) {
        return Object.assign({
            knowledgeKey: knowledgeKey,
            roomTypes: roomTypes,
            tradeId: tradeId,
            phases: phases || [],
            title: title,
            question: question,
            reason: reason,
            severity: severity || 'medium',
            presentAny: presentAny || [],
            scope: 'room'
        }, extra || {});
    }

    var KNOWLEDGE_RULES = [
        rule('bath_plumbing_rough', ['full_bathroom', 'powder_room'], 'plumbing', ['rough_in'], 'Bathroom plumbing rough-in', 'Are the required water, drain, and vent rough-ins included for this bathroom layout?', 'Bathroom fixture locations normally depend on coordinated supply, drainage, and vent rough-ins.', 'high', ['rough in', 'rough-in', 'water line', 'drain line', 'dwv', 'vent stack']),
        rule('bath_bathing_fixture', ['full_bathroom'], 'plumbing', ['finish'], 'Shower or tub fixture', 'Is the shower, tub, or combined bathing fixture intentionally excluded, or should its installation be included?', 'A full bathroom commonly includes a shower or tub, but the exact fixture should be confirmed rather than assumed.', 'high', ['shower install', 'install shower fixture', 'shower valve', 'shower base', 'shower pan', 'bathtub', 'bath tub', 'tub install', 'tub shower']),
        rule('bath_toilet', ['full_bathroom', 'powder_room'], 'plumbing', ['finish'], 'Toilet installation', 'Is the toilet supply, setting, connection, and testing included?', 'A bathroom or powder room normally needs the toilet installation scope confirmed.', 'high', ['toilet', 'water closet']),
        rule('bath_vanity_plumbing', ['full_bathroom', 'powder_room'], 'plumbing', ['finish'], 'Vanity sink and faucet', 'Are the vanity sink, faucet, drain, shutoffs, and final connections included?', 'The vanity plumbing package is often split between fixture supply and final plumbing labour.', 'medium', ['vanity sink', 'bathroom sink', 'lavatory', 'faucet', 'basin']),
        rule('bath_wet_area_waterproofing', ['full_bathroom'], 'waterproofing', [], 'Wet-area waterproofing', 'Is a complete waterproofing system included behind and below the shower or tub finishes?', 'Wet-area finishes depend on a coordinated waterproofing system and compatible transitions.', 'high', ['waterproof', 'water proof', 'shower membrane', 'kerdi', 'redgard', 'red guard', 'wedi']),
        rule('bath_tile_waterproofing_coordination', ['full_bathroom'], 'tile_stone', [], 'Wet-area waterproofing responsibility', 'Who is handling the waterproofing system required before the shower or tub tile is installed?', 'Tile work in a wet area depends on waterproofing even when that work is performed by another trade.', 'high', ['waterproof', 'water proof', 'shower membrane'], { findingKind: 'coordination', dependencyTradeId: 'waterproofing' }),
        rule('bath_tile_substrate', ['full_bathroom', 'powder_room'], 'tile_stone', [], 'Tile substrate and preparation', 'Are backer board, uncoupling membrane, floor preparation, and tile-ready surfaces included where needed?', 'Tile installation can require substrate work that is not part of the finish tile line.', 'medium', ['backer board', 'cement board', 'uncoupling', 'ditra', 'tile prep', 'floor prep']),
        rule('bath_tile_finish', ['full_bathroom', 'powder_room'], 'tile_stone', [], 'Tile finish details', 'Are grout, movement joints, sealant, edge trim, and tile transitions included?', 'Finish details at corners, edges, and transitions are commonly priced separately.', 'medium', ['grout', 'silicone', 'caulk', 'schluter', 'edge trim', 'transition']),
        rule('bath_floor_prep', ['full_bathroom', 'powder_room'], 'flooring', [], 'Bathroom floor preparation', 'Does the bathroom floor need subfloor repair, levelling, underlayment, or moisture preparation before the finish floor?', 'Small wet rooms often need preparation that is not obvious from the flooring quantity.', 'medium', ['subfloor', 'floor prep', 'leveling', 'levelling', 'underlayment', 'moisture barrier']),
        rule('bath_drywall', ['full_bathroom', 'powder_room'], 'drywall', [], 'Bathroom wall and ceiling board', 'Are wall and ceiling board, repairs, finishing, and moisture-appropriate board locations included?', 'Bathroom renovations commonly affect both drywall and specialty wet-area substrates.', 'medium', ['drywall', 'wallboard', 'gypsum', 'board and tape', 'taping']),
        rule('bath_lighting', ['full_bathroom', 'powder_room'], 'electrical', ['finish'], 'Bathroom lighting', 'Are ceiling, vanity, shower-rated, or other required bathroom lights included?', 'Bathroom lighting is often divided among general, vanity, and wet-location fixtures.', 'medium', ['vanity light', 'bathroom light', 'pot light', 'recessed light', 'ceiling light', 'shower light']),
        rule('bath_devices', ['full_bathroom', 'powder_room'], 'electrical', ['finish'], 'Bathroom switches and receptacles', 'Are the bathroom switches, receptacles, and device finishing included?', 'Electrical rough-in and finished devices can be separate scopes.', 'medium', ['receptacle', 'outlet', 'switch', 'device install', 'gfci', 'gfi']),
        rule('bath_exhaust', ['full_bathroom', 'powder_room'], 'hvac_ventilation', [], 'Bathroom exhaust ventilation', 'Is the exhaust fan, duct route, exterior termination, and testing included?', 'Bathroom exhaust involves the fan as well as a complete duct and termination path.', 'high', ['exhaust fan', 'bath fan', 'vent fan', 'bathroom fan']),
        rule('bath_vanity_cabinet', ['full_bathroom', 'powder_room'], 'cabinets_vanities', [], 'Vanity and countertop', 'Are the vanity, countertop, fillers, panels, hardware, and installation included?', 'Vanity packages often need installation pieces beyond the cabinet box itself.', 'medium', ['vanity', 'bath cabinet', 'countertop', 'counter top']),
        rule('bath_mirror', ['full_bathroom', 'powder_room'], 'accessories_hardware', [], 'Bathroom mirror', 'Is the mirror or medicine cabinet, mounting, and blocking coordination included?', 'The mirror is a common finishing item that can be omitted from fixture and vanity scopes.', 'low', ['mirror', 'medicine cabinet']),
        rule('bath_accessories', ['full_bathroom', 'powder_room'], 'accessories_hardware', [], 'Bathroom accessories', 'Are towel bars or hooks, toilet paper holder, and other selected bathroom accessories included?', 'Small wall-mounted accessories are easy to miss and may need backing or careful mounting.', 'low', ['towel bar', 'towel hook', 'robe hook', 'toilet paper', 'bath accessory']),
        rule('bath_trim', ['full_bathroom', 'powder_room'], 'interior_doors_trim', [], 'Bathroom door and trim', 'Are the door, casing, baseboards, and moisture-appropriate trim details included?', 'Flooring, tile, and wall work commonly affect bathroom doors and perimeter trim.', 'medium', ['baseboard', 'casing', 'interior door', 'door install', 'trim']),
        rule('bath_paint', ['full_bathroom', 'powder_room'], 'painting', [], 'Bathroom painting', 'Are wall, ceiling, door, and trim preparation and painting included where those surfaces are not tiled?', 'Bathroom finish scope commonly includes several painted surfaces outside the wet-area tile.', 'medium', ['paint wall', 'wall paint', 'paint ceiling', 'ceiling paint', 'paint trim', 'bathroom paint']),

        rule('kitchen_cabinets', ['kitchen'], 'cabinets_vanities', [], 'Kitchen cabinet installation', 'Are cabinet boxes, fillers, panels, toe kicks, hardware, and installation adjustments included?', 'A complete cabinet installation normally includes finish panels and fitting pieces beyond the boxes.', 'high', ['kitchen cabinet', 'cabinet install', 'base cabinet', 'upper cabinet', 'wall cabinet']),
        rule('kitchen_countertops', ['kitchen'], 'cabinets_vanities', [], 'Kitchen countertops', 'Are countertop templating, fabrication, installation, sink cutouts, and finishing included?', 'Countertops are often supplied separately from cabinetry and need their own coordination.', 'high', ['countertop', 'counter top', 'stone top', 'quartz', 'granite']),
        rule('kitchen_plumbing_rough', ['kitchen'], 'plumbing', ['rough_in'], 'Kitchen plumbing rough-in', 'Are the sink, dishwasher, refrigerator, and other selected appliance water and drain rough-ins included?', 'Kitchen layouts can move several plumbing connections that are easy to miss.', 'high', ['rough in', 'rough-in', 'sink drain', 'dishwasher line', 'fridge line', 'refrigerator line']),
        rule('kitchen_sink_faucet', ['kitchen'], 'plumbing', ['finish'], 'Kitchen sink and faucet', 'Are the sink, faucet, drain assembly, shutoffs, and final connections included?', 'Sink supply and installation are commonly split across countertop and plumbing scopes.', 'medium', ['kitchen sink', 'faucet', 'sink install', 'garburator', 'garbage disposal']),
        rule('kitchen_electrical_rough', ['kitchen'], 'electrical', ['rough_in'], 'Kitchen electrical rough-in', 'Are appliance circuits, countertop circuits, lighting feeds, and required box locations included for the final layout?', 'Cabinet and appliance plans drive kitchen electrical rough-in requirements.', 'high', ['rough electrical', 'rough-in electrical', 'appliance circuit', 'counter circuit', 'wire kitchen']),
        rule('kitchen_lighting_devices', ['kitchen'], 'electrical', ['finish'], 'Kitchen lighting and devices', 'Are ceiling lights, under-cabinet lighting, switches, receptacles, and appliance connections included?', 'Kitchen electrical finishing includes more than the main ceiling fixtures.', 'medium', ['under cabinet light', 'kitchen light', 'receptacle', 'outlet', 'switch', 'appliance connection']),
        rule('kitchen_ventilation', ['kitchen'], 'hvac_ventilation', [], 'Range hood ventilation', 'Is the range hood or exhaust fan, ducting, exterior termination, and make-up coordination included?', 'Kitchen exhaust equipment needs a complete route and termination, not only the appliance.', 'high', ['range hood', 'hood fan', 'kitchen exhaust', 'exhaust duct']),
        rule('kitchen_backsplash', ['kitchen'], 'tile_stone', [], 'Kitchen backsplash', 'Is backsplash preparation, tile or slab installation, grout, sealant, and edge finishing included?', 'Backsplashes are commonly selected after cabinets and countertops and can be missed in the first quote.', 'medium', ['backsplash', 'back splash']),
        rule('kitchen_flooring', ['kitchen'], 'flooring', [], 'Kitchen flooring details', 'Are subfloor preparation, flooring, transitions, and appliance or cabinet edge details included?', 'Kitchen flooring can require preparation and careful sequencing with cabinets and appliances.', 'medium', ['kitchen floor', 'flooring', 'subfloor', 'transition']),
        rule('kitchen_drywall', ['kitchen'], 'drywall', [], 'Kitchen drywall and repairs', 'Are wall and ceiling board, cabinet-removal repairs, finishing, and patching included?', 'Cabinet, electrical, plumbing, and backsplash work commonly disturb kitchen walls and ceilings.', 'medium', ['drywall', 'wallboard', 'patch', 'taping']),
        rule('kitchen_paint', ['kitchen'], 'painting', [], 'Kitchen painting', 'Are exposed walls, ceiling, doors, and trim preparation and painting included after the other work?', 'Cabinet and backsplash work often leaves a reduced but still important painting scope.', 'medium', ['paint wall', 'paint ceiling', 'kitchen paint', 'paint trim']),
        rule('kitchen_trim', ['kitchen'], 'interior_doors_trim', [], 'Kitchen trim and finish carpentry', 'Are baseboards, casing, cabinet-adjacent trim, and finish carpentry included?', 'Cabinet and flooring changes commonly affect perimeter trim and small finish pieces.', 'medium', ['baseboard', 'casing', 'trim', 'finish carpentry']),
        rule('kitchen_cabinet_plumbing_coordination', ['kitchen'], 'cabinets_vanities', [], 'Cabinet and plumbing coordination', 'Who is handling sink, dishwasher, and refrigerator plumbing coordination around the new cabinets?', 'Cabinet installation depends on confirmed plumbing locations even when plumbing is by others.', 'medium', ['plumbing coordination', 'sink location', 'dishwasher connection'], { findingKind: 'coordination', dependencyTradeId: 'plumbing' }),
        rule('kitchen_cabinet_electrical_coordination', ['kitchen'], 'cabinets_vanities', [], 'Cabinet and electrical coordination', 'Who is handling appliance, receptacle, and lighting locations that depend on the cabinet plan?', 'Cabinet layouts and appliance panels depend on coordinated electrical locations.', 'medium', ['electrical coordination', 'appliance location', 'under cabinet wiring'], { findingKind: 'coordination', dependencyTradeId: 'electrical' }),

        rule('room_electrical_rough', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'electrical', ['rough_in'], 'Room electrical rough-in', 'Are lighting, switch, receptacle, data, and equipment box locations included for this room?', 'Room finish work should be coordinated with the electrical layout before walls are closed.', 'medium', ['rough electrical', 'rough-in electrical', 'wiring', 'new circuit', 'new box']),
        rule('room_lighting_devices', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'electrical', ['finish'], 'Room lighting and devices', 'Are light fixtures, switches, receptacles, dimmers, and selected specialty devices included?', 'Finished devices and fixtures are often separate from electrical rough-in.', 'medium', ['light fixture', 'ceiling light', 'pot light', 'recessed light', 'switch', 'receptacle', 'outlet', 'dimmer']),
        rule('room_hvac', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'hvac_ventilation', [], 'Heating, cooling, and air distribution', 'Are supply and return registers, duct changes, thermostat needs, and balancing included where affected?', 'Layout and finish changes can alter air distribution even when the main HVAC system remains.', 'medium', ['supply register', 'return air', 'duct', 'thermostat', 'hvac', 'vent']),
        rule('room_drywall', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'drywall', [], 'Walls and ceilings', 'Are required wall and ceiling board, repairs, taping, corner bead, and finishing included?', 'Electrical, framing, and demolition work commonly create drywall repairs beyond the obvious area.', 'medium', ['drywall', 'wallboard', 'ceiling repair', 'wall repair', 'taping', 'corner bead']),
        rule('room_floor_prep', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'flooring', [], 'Floor preparation and underlayment', 'Are removal, subfloor repairs, levelling, underlayment, and moisture requirements included for the selected floor?', 'Finish flooring depends on the condition and compatibility of the surface below it.', 'medium', ['subfloor', 'floor prep', 'leveling', 'levelling', 'underlayment', 'moisture barrier']),
        rule('room_floor_transitions', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'flooring', [], 'Floor transitions and edges', 'Are thresholds, reducers, transitions, nosings, and other exposed floor edges included?', 'Transitions are often separate accessories and depend on adjacent floor heights.', 'medium', ['transition', 'reducer', 'threshold', 'nosing']),
        rule('room_floor_trim', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'flooring', [], 'Flooring perimeter trim', 'Will baseboards be removed and reinstalled, replaced, or finished with shoe moulding?', 'New flooring commonly affects the perimeter trim even when the floor itself is fully priced.', 'medium', ['baseboard', 'shoe moulding', 'shoe molding', 'quarter round', 'trim reinstall']),
        rule('room_floor_removal_disposal', ['full_bathroom', 'powder_room', 'kitchen', 'bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'laundry_mudroom', 'basement_utility', 'whole_floor'], 'flooring', [], 'Existing flooring removal and disposal', 'Is removal, hauling, and disposal of the existing flooring required and included?', 'Installation lines do not always include demolition and disposal of the existing finish.', 'low', ['remove existing floor', 'remove and dispose', 'dispose of existing flooring', 'floor removal', 'remove flooring', 'floor disposal', 'haul flooring']),
        rule('room_doors_trim', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'interior_doors_trim', [], 'Doors, baseboards, and casing', 'Are affected doors, hardware, casing, baseboards, and other finish carpentry included?', 'Wall and flooring changes commonly affect room openings and perimeter trim.', 'medium', ['interior door', 'door hardware', 'casing', 'baseboard', 'trim']),
        rule('room_paint_walls', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'painting', [], 'Wall preparation and painting', 'Are wall repairs, preparation, primer where needed, and finish coats included?', 'Painting descriptions can omit the preparation needed to produce the final finish.', 'medium', ['paint wall', 'wall paint', 'painting walls', 'prime and paint']),
        rule('room_paint_ceiling', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'painting', [], 'Ceiling painting', 'Are ceilings intentionally excluded, or should ceiling preparation and painting be included?', 'Ceilings are commonly confirmed separately from wall painting.', 'medium', ['paint ceiling', 'ceiling paint', 'painting ceiling', 'paint walls and ceilings', 'painting walls and ceilings']),
        rule('room_paint_trim', ['bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'whole_floor'], 'painting', [], 'Trim and door painting', 'Are baseboards, casing, doors, and other painted trim included?', 'Trim and doors are frequently priced separately from walls and ceilings.', 'medium', ['paint trim', 'paint baseboard', 'paint casing', 'paint door']),
        rule('room_paint_primer', ['full_bathroom', 'powder_room', 'kitchen', 'bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'laundry_mudroom', 'basement_utility', 'garage_workshop', 'stairs_landing', 'whole_floor'], 'painting', [], 'Primer and sealer', 'Do new board, repairs, stains, bare surfaces, or major colour changes require primer or sealer?', 'Primer and specialty sealers are common painting materials that may not be included in a finish-coat line.', 'low', ['primer', 'prime', 'prime coat', 'sealer', 'stain block', 'stain-block']),
        rule('room_paint_protection', ['full_bathroom', 'powder_room', 'kitchen', 'bedroom', 'living_area', 'dining_room', 'office', 'hallway_entry', 'laundry_mudroom', 'basement_utility', 'garage_workshop', 'stairs_landing', 'whole_floor'], 'painting', [], 'Painting protection', 'Are floor, fixture, furniture, and adjacent-surface masking and protection included?', 'Protection labour and materials can be significant in occupied or partially finished rooms.', 'medium', ['floor protection', 'masking', 'drop cloth', 'surface protection', 'poly sheeting']),

        rule('laundry_plumbing_rough', ['laundry_mudroom'], 'plumbing', ['rough_in'], 'Laundry plumbing rough-in', 'Are washer supplies, drain, standpipe, venting, and any laundry sink rough-ins included?', 'Laundry equipment needs coordinated supply and drainage locations.', 'high', ['washer box', 'standpipe', 'laundry drain', 'rough plumbing', 'laundry sink rough']),
        rule('laundry_plumbing_finish', ['laundry_mudroom'], 'plumbing', ['finish'], 'Laundry plumbing connections', 'Are washer hoses, shutoffs, drains, laundry sink fixtures, and final testing included?', 'Final appliance and fixture connections can be separate from rough-in work.', 'medium', ['washer connection', 'laundry sink', 'shutoff', 'hose connection']),
        rule('laundry_electrical', ['laundry_mudroom'], 'electrical', ['rough_in', 'finish'], 'Laundry electrical', 'Are washer, dryer, lighting, receptacle, and selected equipment electrical requirements included?', 'Laundry appliances can require dedicated and equipment-specific electrical work.', 'high', ['dryer outlet', 'dryer circuit', 'washer circuit', 'laundry light', 'laundry receptacle']),
        rule('laundry_vent', ['laundry_mudroom'], 'hvac_ventilation', [], 'Dryer exhaust', 'Is the dryer exhaust duct, exterior termination, access, and final connection included?', 'A complete dryer installation needs a suitable exhaust route and termination.', 'high', ['dryer vent', 'dryer duct', 'exhaust termination']),
        rule('laundry_flooring', ['laundry_mudroom'], 'flooring', [], 'Laundry floor preparation', 'Are subfloor preparation, moisture considerations, flooring, and transitions included?', 'Laundry rooms can need added floor preparation around appliances and drains.', 'medium', ['subfloor', 'floor prep', 'flooring', 'transition', 'moisture barrier']),
        rule('laundry_cabinets', ['laundry_mudroom'], 'cabinets_vanities', [], 'Laundry storage and countertop', 'Are selected cabinets, shelves, countertop, fillers, hardware, and installation included?', 'Laundry storage packages often include small finish pieces that are easy to omit.', 'medium', ['laundry cabinet', 'laundry shelf', 'countertop', 'counter top']),
        rule('laundry_finishes', ['laundry_mudroom'], 'drywall', [], 'Laundry wall and ceiling repairs', 'Are wall and ceiling board, utility cutout repairs, taping, and finishing included?', 'Mechanical and appliance changes often disturb laundry-room walls.', 'medium', ['drywall', 'wallboard', 'patch', 'taping']),
        rule('laundry_paint', ['laundry_mudroom'], 'painting', [], 'Laundry painting', 'Are wall, ceiling, door, and trim preparation and painting included?', 'Laundry rooms still need finish work around equipment and cabinetry.', 'low', ['paint wall', 'paint ceiling', 'paint trim', 'laundry paint']),

        rule('basement_moisture', ['basement_utility'], 'waterproofing', [], 'Basement moisture management', 'Have foundation moisture, cracks, drainage, and below-grade waterproofing needs been addressed in the scope?', 'Below-grade finishes depend on understanding and managing existing moisture conditions.', 'high', ['foundation waterproof', 'crack repair', 'sump', 'weeping tile', 'moisture management']),
        rule('basement_framing', ['basement_utility'], 'framing_structural', [], 'Basement framing', 'Are walls, bulkheads, backing, openings, and required structural changes included?', 'Basement layouts often need framing around services and support conditions.', 'high', ['wall framing', 'bulkhead', 'backing', 'structural opening', 'basement framing']),
        rule('basement_insulation', ['basement_utility'], 'insulation', [], 'Basement insulation and air sealing', 'Are foundation insulation, rim-joist treatment, acoustic insulation, and air sealing included where applicable?', 'Basement comfort and finish performance depend on coordinated insulation and air sealing.', 'medium', ['foundation insulation', 'rim joist', 'air seal', 'acoustic insulation', 'basement insulation']),
        rule('basement_hvac', ['basement_utility'], 'hvac_ventilation', [], 'Basement HVAC changes', 'Are supply, return, equipment access, duct relocations, and balancing included for the new layout?', 'Basement walls and ceilings often conflict with existing ductwork and equipment access.', 'high', ['supply air', 'return air', 'duct relocation', 'furnace access', 'hvac']),
        rule('basement_electrical', ['basement_utility'], 'electrical', ['rough_in', 'finish'], 'Basement electrical scope', 'Are lighting, switches, receptacles, equipment clearances, and electrical-panel coordination included?', 'Basement development usually affects both room electrical and existing service equipment.', 'high', ['basement electrical', 'receptacle', 'lighting', 'panel', 'new circuit']),
        rule('basement_drywall', ['basement_utility'], 'drywall', [], 'Basement drywall', 'Are walls, ceilings or bulkheads, access panels, repairs, and finishing included?', 'Basement mechanical conditions create extra drywall transitions and access needs.', 'medium', ['drywall', 'bulkhead board', 'access panel', 'taping']),
        rule('basement_flooring', ['basement_utility'], 'flooring', [], 'Below-grade flooring preparation', 'Are moisture testing, floor levelling, underlayment, and a below-grade-compatible floor system included?', 'Below-grade slabs can require preparation and moisture control before finish flooring.', 'high', ['moisture test', 'floor leveling', 'floor levelling', 'underlayment', 'below grade flooring']),

        rule('garage_electrical', ['garage_workshop'], 'electrical', ['rough_in', 'finish'], 'Garage electrical', 'Are lighting, switches, receptacles, door equipment, and workshop circuits included for the intended use?', 'Garage and workshop loads often differ from ordinary room electrical.', 'medium', ['garage light', 'garage receptacle', 'door opener', 'workshop circuit', 'electrical']),
        rule('garage_insulation', ['garage_workshop'], 'insulation', [], 'Garage insulation and air sealing', 'Are exterior walls, ceiling, door interfaces, and air sealing included where the garage is being conditioned or separated?', 'Garage assemblies can need coordinated thermal and air-sealing work.', 'medium', ['garage insulation', 'air sealing', 'insulate wall', 'insulate ceiling']),
        rule('garage_drywall', ['garage_workshop'], 'drywall', [], 'Garage wall and ceiling board', 'Are wall and ceiling board, repairs, finishing level, and service penetrations included?', 'Garage walls and ceilings often contain equipment and penetrations that affect board scope.', 'medium', ['garage drywall', 'wallboard', 'ceiling board', 'taping']),
        rule('garage_door_envelope', ['garage_workshop'], 'exterior_envelope', [], 'Garage doors and exterior openings', 'Are garage doors, operators, weather seals, exterior doors, windows, and opening finishes included where affected?', 'Exterior garage openings need coordinated products, sealing, and trim.', 'high', ['garage door', 'door operator', 'weather seal', 'exterior door', 'garage window']),
        rule('garage_floor', ['garage_workshop'], 'flooring', [], 'Garage floor finish', 'Are slab repairs, crack preparation, moisture testing, and the selected garage floor finish included?', 'Coatings and garage flooring depend heavily on existing slab conditions.', 'medium', ['garage floor', 'epoxy', 'floor coating', 'crack repair', 'slab prep']),

        rule('stairs_structure', ['stairs_landing'], 'framing_structural', [], 'Stair structure', 'Are stringers, landings, framing changes, backing, and structural connections included?', 'Stair finish work depends on a complete and accurately framed structure.', 'high', ['stringer', 'landing framing', 'stair framing', 'structural stair']),
        rule('stairs_treads_nosings', ['stairs_landing'], 'flooring', [], 'Treads, risers, and nosings', 'Are stair treads, risers, nosings, landings, and transitions included?', 'Stair flooring uses specialized finish pieces that differ from ordinary floor areas.', 'high', ['stair tread', 'riser', 'nosing', 'landing floor']),
        rule('stairs_rails', ['stairs_landing'], 'accessories_hardware', [], 'Handrails and guards', 'Are handrails, guards, posts, brackets, and related blocking or mounting included?', 'Stair rail systems require coordinated support and finish components.', 'high', ['handrail', 'guardrail', 'guard rail', 'newel', 'baluster', 'railing']),
        rule('stairs_lighting', ['stairs_landing'], 'electrical', ['rough_in', 'finish'], 'Stair and landing lighting', 'Are stair and landing lights, switching, and any step or wall lighting included?', 'Stair circulation commonly needs coordinated lighting and switching at multiple levels.', 'medium', ['stair light', 'landing light', 'step light', 'three way switch', '3 way switch']),
        rule('stairs_finishes', ['stairs_landing'], 'painting', [], 'Stair painting and finishing', 'Are walls, ceilings, stringers, risers, rails, and trim preparation and painting included where applicable?', 'Stairs contain several finish surfaces that are easy to separate or omit.', 'medium', ['paint stair', 'paint railing', 'paint wall', 'paint ceiling', 'paint trim']),

        rule('deck_footings_coordination', ['deck_porch'], 'framing_structural', [], 'Deck footing responsibility', 'Who is handling footing excavation, concrete, anchors, and inspections for the deck structure?', 'Deck framing depends on confirmed footing and anchorage work even when another trade performs it.', 'high', ['footing', 'helical pile', 'sonotube', 'deck pier'], { findingKind: 'coordination', dependencyTradeId: 'concrete_masonry' }),
        rule('deck_structure', ['deck_porch'], 'framing_structural', [], 'Deck framing and connections', 'Are beams, joists, ledger or freestanding supports, blocking, stairs, and structural connectors included?', 'Deck scope can miss blocking, connectors, and stair framing when priced mainly by surface area.', 'high', ['deck framing', 'joist', 'beam', 'ledger', 'blocking', 'structural connector']),
        rule('deck_surface', ['deck_porch'], 'interior_doors_trim', [], 'Decking and finish carpentry', 'Are decking, fascia, picture framing, skirting, stairs, and finish details included?', 'Deck finish packages commonly need fascia and edge details beyond the field decking.', 'medium', ['decking', 'deck board', 'fascia', 'skirting', 'picture frame']),
        rule('deck_rails', ['deck_porch'], 'accessories_hardware', [], 'Deck guards and handrails', 'Are guards, handrails, posts, gates, hardware, and mounting details included?', 'Raised decks and stairs often require a separate railing package.', 'high', ['deck railing', 'guardrail', 'handrail', 'rail post', 'deck gate']),
        rule('deck_water_management', ['deck_porch'], 'waterproofing', [], 'Deck flashing and water management', 'Are ledger flashing, membrane transitions, penetrations, and drainage details included?', 'Deck connections can direct water toward the building if flashing and drainage are not coordinated.', 'high', ['ledger flashing', 'deck membrane', 'flashing', 'water management', 'drainage']),
        rule('deck_electrical', ['deck_porch'], 'electrical', ['rough_in', 'finish'], 'Deck electrical', 'Are exterior lighting, receptacles, equipment feeds, wiring protection, and switching included?', 'Exterior living areas commonly need electrical work coordinated before finishes are installed.', 'medium', ['deck light', 'exterior receptacle', 'outdoor outlet', 'exterior wiring']),

        rule('fence_posts', ['fence_gate'], 'sitework_landscaping', [], 'Fence layout and post work', 'Are layout, utility coordination, post holes, concrete or driven posts, and grade changes included?', 'Fence installation depends on site layout, ground conditions, and stable posts.', 'high', ['post hole', 'fence post', 'post concrete', 'fence layout', 'utility locate']),
        rule('fence_panels', ['fence_gate'], 'interior_doors_trim', [], 'Fence panels and finish carpentry', 'Are panels or boards, caps, trim, transitions, and tie-ins to existing fencing included?', 'Fence finish scope often includes custom transitions and end conditions.', 'medium', ['fence panel', 'fence board', 'fence cap', 'fence trim']),
        rule('fence_gates', ['fence_gate'], 'accessories_hardware', [], 'Fence gates and hardware', 'Are gates, hinges, latches, stops, drop rods, and alignment adjustments included?', 'Gate hardware and reinforcement are commonly separate from straight fence runs.', 'medium', ['gate', 'hinge', 'latch', 'drop rod']),

        rule('roof_removal', ['roof'], 'demolition', [], 'Roof removal and disposal', 'Are existing roof layers, flashings, damaged decking, hauling, and disposal included?', 'Roof replacement can uncover multiple layers and substrate repairs not covered by installation alone.', 'high', ['roof removal', 'tear off', 'shingle removal', 'roof disposal', 'dumpster']),
        rule('roof_underlayment', ['roof'], 'roofing', [], 'Roof underlayment and flashings', 'Are underlayment, ice and water protection, valleys, drip edge, wall flashings, and penetrations included?', 'Roof performance depends on the complete flashing and underlayment system, not only the surface covering.', 'high', ['underlayment', 'ice and water', 'drip edge', 'valley flashing', 'step flashing']),
        rule('roof_covering', ['roof'], 'roofing', [], 'Roof covering system', 'Are field materials, starter, ridge or hip caps, fasteners, and manufacturer-required accessories included?', 'Roof surface systems include dedicated edge and ridge components.', 'high', ['shingle', 'metal roof', 'roof membrane', 'starter strip', 'ridge cap']),
        rule('roof_ventilation', ['roof'], 'roofing', [], 'Roof ventilation', 'Are intake, exhaust, baffles, and existing ventilation changes included where affected?', 'Roof replacement is an important point to confirm the complete ventilation path.', 'medium', ['ridge vent', 'roof vent', 'soffit vent', 'ventilation', 'baffle']),
        rule('roof_gutters', ['roof'], 'exterior_envelope', [], 'Gutters and drainage', 'Are gutters, downspouts, extensions, and temporary removal or reinstatement included where affected?', 'Roof work often affects roof-edge drainage components.', 'medium', ['gutter', 'eavestrough', 'downspout']),

        rule('exterior_weather_barrier', ['exterior_envelope'], 'exterior_envelope', [], 'Weather barrier and flashing', 'Are weather barrier, tapes, flashings, penetrations, and transitions to existing assemblies included?', 'Exterior finishes depend on a continuous drainage and air-control layer behind them.', 'high', ['weather barrier', 'house wrap', 'flashing tape', 'window flashing', 'door flashing']),
        rule('exterior_cladding', ['exterior_envelope'], 'exterior_envelope', [], 'Cladding and exterior trim', 'Are cladding, starter and finish pieces, corners, trims, soffit, fascia, and sealants included?', 'Exterior cladding systems rely on many accessory and termination pieces.', 'high', ['siding', 'cladding', 'exterior trim', 'soffit', 'fascia', 'sealant']),
        rule('exterior_openings', ['exterior_envelope'], 'exterior_envelope', [], 'Windows and exterior doors', 'Are products, removal, installation, flashing, insulation, interior and exterior trim, and hardware included?', 'Window and door replacements span weatherproofing and both interior and exterior finishes.', 'high', ['window install', 'exterior door', 'patio door', 'entry door', 'opening install']),
        rule('exterior_paint', ['exterior_envelope'], 'painting', [], 'Exterior coating preparation', 'Are cleaning, scraping, repairs, primer, caulking, protection, and finish coats included?', 'Exterior coating durability depends heavily on preparation and sealant work.', 'medium', ['exterior paint', 'stain', 'scraping', 'exterior primer', 'caulking']),

        rule('hardscape_excavation', ['patio_hardscape'], 'sitework_landscaping', [], 'Hardscape excavation and base', 'Are excavation, haul-off, geotextile, granular base, compaction, and grading included?', 'Patios and walkways depend on a properly prepared and drained base.', 'high', ['excavation', 'geotextile', 'granular base', 'compaction', 'grading']),
        rule('hardscape_drainage', ['patio_hardscape'], 'sitework_landscaping', [], 'Hardscape drainage', 'Are finished slopes, drainage routes, adjacent grades, and water-control details included?', 'Hard surfaces change runoff and must be coordinated with surrounding grades.', 'high', ['drainage', 'slope', 'grading', 'drain']),
        rule('hardscape_pavers', ['patio_hardscape'], 'concrete_masonry', [], 'Hardscape finish system', 'Are pavers or concrete, bedding, joints, edge restraints, cuts, curing, and finish details included?', 'The finish surface needs a complete edge and joint system.', 'high', ['paver', 'patio concrete', 'bedding sand', 'edge restraint', 'control joint']),
        rule('hardscape_steps_walls', ['patio_hardscape'], 'concrete_masonry', [], 'Steps and retaining conditions', 'Are steps, landings, retaining edges, caps, and transitions to doors or walkways included where needed?', 'Grade changes can create additional masonry or concrete elements beyond the main surface.', 'medium', ['step', 'landing', 'retaining wall', 'wall cap', 'threshold']),

        rule('site_grading', ['site_landscaping'], 'sitework_landscaping', [], 'Site grading and drainage', 'Are existing and finished grades, drainage routes, erosion control, and restoration included?', 'Site work can redirect water and disturb areas beyond the immediate construction zone.', 'high', ['grading', 'drainage', 'erosion control', 'swale', 'restoration']),
        rule('site_excavation', ['site_landscaping'], 'sitework_landscaping', [], 'Excavation and material handling', 'Are excavation, unsuitable material, imported fill, compaction, stockpiling, and haul-off included?', 'Soil conditions and material handling can materially change sitework scope.', 'high', ['excavation', 'fill', 'compaction', 'haul off', 'soil removal']),
        rule('site_landscape_finish', ['site_landscaping'], 'sitework_landscaping', [], 'Landscape restoration', 'Are topsoil, sod or seed, planting, mulch, irrigation repairs, and final cleanup included where disturbed?', 'Construction access and grading often require restoration outside the main work area.', 'medium', ['topsoil', 'sod', 'seed', 'planting', 'mulch', 'irrigation repair']),

        rule('general_protection', ['all'], 'general_conditions', [], 'Site and finish protection', 'Are access routes, occupied-area separation, dust control, floor protection, and protection of existing finishes included?', 'Protection requirements can add meaningful labour and materials to otherwise complete trade scopes.', 'medium', ['floor protection', 'dust control', 'zip wall', 'site protection', 'protect existing'], { scope: 'quote' }),
        rule('general_access', ['all'], 'general_conditions', [], 'Access and project logistics', 'Are parking, deliveries, material staging, equipment access, working hours, and temporary services accounted for?', 'Restricted access and staging can affect several trades and the project schedule.', 'medium', ['material staging', 'delivery', 'equipment access', 'working hours', 'temporary power', 'site access'], { scope: 'quote' }),
        rule('general_cleanup_disposal', ['all'], 'general_conditions', [], 'Cleanup and disposal', 'Are daily cleanup, final cleanup, bins, hauling, tipping fees, and disposal included?', 'Waste handling is commonly spread across trades or omitted when only installation items are listed.', 'medium', ['cleanup', 'clean up', 'disposal', 'dumpster', 'bin', 'haul', 'tipping fee'], { scope: 'quote' }),
        rule('general_permits_inspections', ['all'], 'general_conditions', [], 'Permits and inspections', 'Who is responsible for determining, obtaining, scheduling, and closing any required permits or inspections?', 'Permit and inspection responsibility should be explicit without assuming what the local authority requires.', 'medium', ['permit', 'inspection', 'approval fee'], { scope: 'quote' })
    ];

    var COPILOT_RULES = [
        rule('paint_finish_schedule_optimization', ['all'], 'painting', [], 'Coordinate the paint finish schedule', 'Would confirming colours, sheen levels, and change points now reduce remobilization and touch-ups?', 'A finish schedule can keep repeated painting work consistent and reduce avoidable return work without adding scope.', 'low', [], {
            insightType: 'optimization',
            triggerAny: ['paint', 'painting', 'coating'],
            resolvedAny: ['finish schedule', 'colour schedule', 'color schedule', 'sheen schedule', 'same colour', 'same color'],
            suggestedAction: 'Confirm colours, sheen levels, and transition points before ordering and mobilizing.'
        }),
        rule('paint_cure_access_timeline', ['all'], 'painting', [], 'Painting cure and access timing', 'Are recoat, cure, occupancy, and access constraints reflected in the work sequence?', 'Drying and cure conditions can affect when adjacent work or normal room use can resume.', 'medium', [], {
            insightType: 'timeline_risk',
            triggerAny: ['paint', 'painting', 'coating'],
            resolvedAny: ['dry time', 'drying time', 'recoat', 'cure time', 'occupancy', 'access restriction'],
            suggestedAction: 'Confirm product-specific recoat and cure constraints before committing the sequence.'
        }),
        rule('flooring_acclimation_timeline', ['all'], 'flooring', [], 'Flooring acclimation and moisture timing', 'Have acclimation, moisture checks, and site-condition requirements been allowed for before installation?', 'Some flooring systems depend on stable environmental and substrate conditions before work can begin.', 'medium', [], {
            insightType: 'timeline_risk',
            triggerAny: ['hardwood', 'engineered wood', 'laminate', 'luxury vinyl', 'lvp', 'flooring'],
            resolvedAny: ['acclimation', 'acclimate', 'moisture test', 'moisture reading', 'site condition', 'temperature and humidity'],
            suggestedAction: 'Verify the selected product and substrate requirements before fixing the installation date.'
        }),
        rule('flooring_yield_cost_risk', ['all'], 'flooring', [], 'Flooring waste and spare material', 'Does the material plan account for cuts, layout waste, pattern matching, and any requested spare stock?', 'Net floor area alone may not reflect the material needed for cuts, layout, and future repairs.', 'medium', [], {
            insightType: 'cost_risk',
            triggerAny: ['hardwood', 'engineered wood', 'laminate', 'luxury vinyl', 'lvp', 'flooring'],
            resolvedAny: ['waste factor', 'overage', 'cut allowance', 'attic stock', 'spare material', 'pattern waste'],
            suggestedAction: 'Confirm the material-yield assumption without inventing an allowance or quantity.'
        }),
        rule('tile_layout_finish_cost_risk', ['all'], 'tile_stone', [], 'Tile layout and specialty pieces', 'Are layout decisions, cuts, edge profiles, finish pieces, and material yield clearly accounted for?', 'Patterns, exposed edges, niches, and specialty pieces can change labour and material needs even when tile area is known.', 'medium', [], {
            insightType: 'cost_risk',
            triggerAny: ['tile', 'stone', 'backsplash'],
            resolvedAny: ['tile layout', 'pattern layout', 'edge trim', 'schluter', 'bullnose', 'waste factor', 'cut allowance'],
            suggestedAction: 'Confirm the layout and exposed-edge details before final material and labour commitments.'
        }),
        rule('tile_cure_sequence_timeline', ['all'], 'tile_stone', [], 'Tile readiness and cure sequence', 'Are substrate readiness, cure periods, and the handoff into grouting or fixture work clear?', 'Tile work can be delayed when preceding systems or setting materials are not ready for the next step.', 'medium', [], {
            insightType: 'timeline_risk',
            triggerAny: ['tile', 'stone', 'backsplash'],
            resolvedAny: ['cure time', 'dry time', 'substrate ready', 'flood test', 'grout next day', 'work sequence'],
            suggestedAction: 'Confirm manufacturer and project readiness requirements before scheduling follow-on work.'
        }),
        rule('cabinet_template_lead_timeline', ['kitchen', 'full_bathroom', 'powder_room', 'laundry_mudroom', 'office', 'whole_floor'], 'cabinets_vanities', [], 'Cabinet approvals and countertop templating', 'Are field measurements, approvals, templating, fabrication, and installation handoffs reflected in the sequence?', 'Cabinet and countertop work can contain approval and fabrication handoffs that affect follow-on trades.', 'high', [], {
            insightType: 'timeline_risk',
            triggerAny: ['cabinet', 'vanity', 'countertop', 'counter top'],
            resolvedAny: ['field measure', 'field measurement', 'template', 'templating', 'shop drawing', 'approval', 'lead time'],
            suggestedAction: 'Identify the required approvals and handoff points before promising completion timing.'
        }),
        rule('plumbing_fixture_selection_timeline', ['all'], 'plumbing', ['finish'], 'Plumbing fixture selection readiness', 'Are the selected fixture models, supply responsibility, and required installation information confirmed before finish plumbing?', 'Unconfirmed or unavailable fixtures can delay final connections and affect compatible rough-in locations.', 'medium', [], {
            insightType: 'timeline_risk',
            triggerAny: ['toilet', 'faucet', 'sink', 'shower fixture', 'tub', 'plumbing fixture'],
            resolvedAny: ['model number', 'owner supplied', 'client supplied', 'fixture selection', 'on site', 'lead time'],
            suggestedAction: 'Confirm fixture selections and supply responsibility before scheduling finish work.'
        }),
        rule('electrical_fixture_selection_timeline', ['all'], 'electrical', ['finish'], 'Electrical fixture selection readiness', 'Are fixture models, control compatibility, supply responsibility, and delivery timing confirmed?', 'Late fixture or control selections can delay finishing and create compatibility questions at installation.', 'medium', [], {
            insightType: 'timeline_risk',
            triggerAny: ['light fixture', 'lighting', 'dimmer', 'device', 'ceiling fan'],
            resolvedAny: ['fixture schedule', 'model number', 'owner supplied', 'client supplied', 'on site', 'lead time'],
            suggestedAction: 'Confirm fixture and control selections before scheduling electrical finishing.'
        }),
        rule('demolition_concealed_condition_cost', ['all'], 'demolition', [], 'Concealed demolition conditions', 'Are unknown layers, hidden damage, hazardous-material discoveries, and change handling clearly addressed?', 'Demolition can expose conditions that are not visible when the quote is prepared and should not be silently assumed.', 'high', [], {
            insightType: 'cost_risk',
            triggerAny: ['demolition', 'demo', 'remove existing', 'tear out', 'tear off'],
            resolvedAny: ['concealed condition', 'hidden condition', 'additional layer', 'unit rate', 'change order', 'allowance'],
            suggestedAction: 'State how genuinely concealed conditions will be documented and approved if discovered.'
        }),
        rule('roof_weather_dryin_timeline', ['roof'], 'roofing', [], 'Roof weather and dry-in plan', 'Is the weather window, temporary protection, and dry-in sequence clear for the roof work?', 'Weather exposure can affect both the work sequence and protection of the building during roof replacement.', 'high', [], {
            insightType: 'timeline_risk',
            triggerAny: ['roof', 'shingle', 'roof membrane', 'metal roof'],
            resolvedAny: ['weather window', 'dry in', 'dry-in', 'temporary protection', 'tarp', 'weather protection'],
            suggestedAction: 'Confirm the dry-in and temporary-protection plan before fixing the start date.'
        }),
        rule('concrete_weather_cure_timeline', ['all'], 'concrete_masonry', [], 'Concrete weather and cure timing', 'Are placement conditions, protection, cure requirements, and follow-on work constraints reflected in the schedule?', 'Concrete performance and access for later work can depend on weather and cure conditions.', 'medium', [], {
            insightType: 'timeline_risk',
            triggerAny: ['concrete', 'masonry', 'slab', 'footing'],
            resolvedAny: ['cure time', 'curing', 'cold weather', 'hot weather', 'weather protection', 'placement temperature'],
            suggestedAction: 'Confirm mix- and condition-specific placement and cure requirements before scheduling follow-on work.'
        }),
        rule('exterior_opening_lead_timeline', ['exterior_envelope', 'garage_workshop', 'whole_floor'], 'exterior_envelope', [], 'Exterior product lead times and opening readiness', 'Are product approvals, field measurements, delivery timing, and weather-tight installation handoffs clear?', 'Windows, doors, and custom exterior components can affect both opening preparation and the project sequence.', 'high', [], {
            insightType: 'timeline_risk',
            triggerAny: ['window', 'exterior door', 'patio door', 'garage door', 'cladding', 'siding'],
            resolvedAny: ['field measure', 'model number', 'shop drawing', 'approval', 'lead time', 'delivery date'],
            suggestedAction: 'Confirm approvals and delivery readiness before committing opening and finish dates.'
        }),
        rule('hvac_startup_timeline', ['all'], 'hvac_ventilation', [], 'HVAC startup and balancing handoff', 'Are equipment availability, startup, controls, testing, and balancing handoffs reflected in the sequence?', 'Mechanical work may not be complete at physical installation if startup or balancing is still outstanding.', 'medium', [], {
            insightType: 'timeline_risk',
            triggerAny: ['hvac', 'furnace', 'air conditioner', 'heat pump', 'duct', 'ventilation'],
            resolvedAny: ['startup', 'commissioning', 'testing and balancing', 'air balance', 'controls setup', 'lead time'],
            suggestedAction: 'Confirm who owns startup and balancing, and when those steps can occur.'
        }),
        rule('general_multi_room_mobilization', ['all'], 'general_conditions', [], 'Coordinate shared project logistics', 'Could protection, deliveries, staging, cleanup, or repeated mobilization be coordinated across the rooms?', 'Multi-room work may be easier to execute when shared logistics are planned once instead of independently by room.', 'low', [], {
            scope: 'quote',
            insightType: 'optimization',
            minRoomCount: 2,
            triggerAny: [],
            resolvedAny: ['mobilization plan', 'shared protection', 'delivery schedule', 'staging plan', 'phased access plan'],
            suggestedAction: 'Review shared logistics for practical sequencing opportunities without changing the quoted scope.'
        })
    ];

    var ALL_RULES = KNOWLEDGE_RULES.concat(COPILOT_RULES);

    var RULES_BY_KEY = ALL_RULES.reduce(function indexRules(result, item) {
        result[item.knowledgeKey] = item;
        return result;
    }, {});

    var KNOWN_DEPENDENCIES = ALL_RULES.reduce(function indexDependencies(result, item) {
        if (item.dependencyTradeId) {
            result[item.tradeId + '|' + item.dependencyTradeId] = true;
        }
        return result;
    }, {});

    function getTrade(tradeId) {
        return TRADES[String(tradeId || '')] || null;
    }

    function getRoomType(roomTypeId) {
        return ROOM_TYPES_BY_ID[String(roomTypeId || '')] || null;
    }

    function getRule(knowledgeKey) {
        return RULES_BY_KEY[String(knowledgeKey || '')] || null;
    }

    function isCustomTradeId(tradeId) {
        return /^custom_trade_[a-f0-9]{8}$/.test(String(tradeId || ''));
    }

    function customTradeId(label) {
        return 'custom_trade_' + stableTextHash(normalizeText(label));
    }

    function detectRoomType(name) {
        var normalized = normalizeText(name);
        for (var index = 0; index < ROOM_DETECTION_RULES.length; index += 1) {
            var detection = ROOM_DETECTION_RULES[index];
            if (detection.pattern.test(normalized)) {
                return {
                    roomTypeId: detection.id,
                    confidence: detection.confidence,
                    needsConfirmation: detection.confidence === 'ambiguous'
                };
            }
        }
        return {
            roomTypeId: 'general_other',
            confidence: 'ambiguous',
            needsConfirmation: true
        };
    }

    function matchTradeRules(value) {
        var normalized = normalizeText(value);
        var matches = [];
        CATEGORY_RULES.forEach(function matchRule(item) {
            if (!item.pattern.test(normalized)) return;
            var existing = matches.find(function sameTrade(candidate) {
                return candidate.tradeId === item.tradeId;
            });
            if (!existing) {
                matches.push({
                    tradeId: item.tradeId,
                    phases: (item.phases || []).slice()
                });
                return;
            }
            (item.phases || []).forEach(function addPhase(phase) {
                if (existing.phases.indexOf(phase) === -1) existing.phases.push(phase);
            });
        });
        matches.forEach(function narrowExplicitPhase(match) {
            if (match.tradeId === 'plumbing') {
                var hasRoughPlumbing = /\brough plumbing\b/.test(normalized);
                var hasFinishPlumbing = /\bfinish plumbing\b/.test(normalized);
                if (hasRoughPlumbing && !hasFinishPlumbing) match.phases = ['rough_in'];
                if (hasFinishPlumbing && !hasRoughPlumbing) match.phases = ['finish'];
            }
            if (match.tradeId === 'electrical') {
                var hasRoughElectrical = /\brough electrical\b/.test(normalized);
                var hasFinishElectrical = /\bfinish electrical\b/.test(normalized);
                if (hasRoughElectrical && !hasFinishElectrical) match.phases = ['rough_in'];
                if (hasFinishElectrical && !hasRoughElectrical) match.phases = ['finish'];
            }
        });
        return matches;
    }

    function detectTradeScope(scope) {
        var knownById = {};
        var customById = {};
        (scope && Array.isArray(scope.rooms) ? scope.rooms : []).forEach(function inspectRoom(room) {
            (room && Array.isArray(room.items) ? room.items : []).forEach(function inspectItem(item) {
                var category = compactText(item && item.category, 100);
                var categoryMatches = matchTradeRules(category);
                categoryMatches.forEach(function addCategoryMatch(match) {
                    knownById[match.tradeId] = knownById[match.tradeId] || { id: match.tradeId, phases: [], sources: [] };
                    match.phases.forEach(function addPhase(phase) {
                        if (knownById[match.tradeId].phases.indexOf(phase) === -1) knownById[match.tradeId].phases.push(phase);
                    });
                    if (category && knownById[match.tradeId].sources.indexOf(category) === -1) knownById[match.tradeId].sources.push(category);
                });

                var optionText = (item && Array.isArray(item.options) ? item.options : []).map(function optionName(option) {
                    return option && option.name || '';
                }).join(' ');
                var itemMatches = categoryMatches.length
                    ? []
                    : matchTradeRules([item && item.name, optionText].filter(Boolean).join(' '));
                itemMatches.forEach(function addItemMatch(match) {
                    knownById[match.tradeId] = knownById[match.tradeId] || { id: match.tradeId, phases: [], sources: [] };
                    match.phases.forEach(function addPhase(phase) {
                        if (knownById[match.tradeId].phases.indexOf(phase) === -1) knownById[match.tradeId].phases.push(phase);
                    });
                });

                var normalizedCategory = normalizeText(category);
                if (category && !categoryMatches.length && !GENERIC_CATEGORIES[normalizedCategory]) {
                    var id = customTradeId(category);
                    customById[id] = {
                        id: id,
                        label: category,
                        sourceCategory: category
                    };
                }
            });
        });

        Object.keys(knownById).forEach(function fillDetectedPhases(tradeId) {
            var trade = getTrade(tradeId);
            if (!trade || !Array.isArray(trade.phases) || !trade.phases.length) return;
            if (!knownById[tradeId].phases.length) {
                knownById[tradeId].phases = trade.phases.map(function phaseId(phase) { return phase.id; });
            }
        });

        var knownTrades = Object.keys(knownById).sort().map(function knownTrade(id) {
            knownById[id].phases.sort();
            knownById[id].sources = knownById[id].sources.slice(0, 4);
            return knownById[id];
        });
        var customTrades = Object.keys(customById).sort().map(function customTrade(id) {
            return customById[id];
        });
        var allTradeIds = knownTrades.map(function knownId(item) { return item.id; })
            .concat(customTrades.map(function customId(item) { return item.id; }))
            .sort();
        var fingerprintParts = knownTrades.map(function knownFingerprint(item) {
            return item.id + ':' + item.phases.join(',');
        }).concat(customTrades.map(function customFingerprint(item) {
            return item.id;
        })).sort();
        return {
            knownTrades: knownTrades,
            customTrades: customTrades,
            allTradeIds: allTradeIds,
            fingerprint: stableTextHash(fingerprintParts.join('|'))
        };
    }

    function normalizeSelectedTrade(value) {
        var tradeId = compactText(typeof value === 'string' ? value : value && value.id, 80);
        if (!getTrade(tradeId) && !isCustomTradeId(tradeId)) return null;
        var trade = getTrade(tradeId);
        var allowedPhases = trade && Array.isArray(trade.phases)
            ? trade.phases.map(function phaseId(phase) { return phase.id; })
            : [];
        var phases = (value && Array.isArray(value.phases) ? value.phases : [])
            .map(function phaseValue(phase) { return compactText(phase, 40); })
            .filter(function allowed(phase) { return allowedPhases.indexOf(phase) !== -1; })
            .filter(function unique(phase, index, all) { return all.indexOf(phase) === index; });
        if (allowedPhases.length && !phases.length) phases = allowedPhases.slice();
        return { id: tradeId, phases: phases };
    }

    function normalizeReviewProfile(value) {
        var profile = value && typeof value === 'object' ? value : {};
        var customTrades = (Array.isArray(profile.customTrades) ? profile.customTrades : [])
            .map(function normalizeCustomTrade(item) {
                var label = compactText(item && (item.label || item.sourceCategory), 100);
                var id = compactText(item && item.id, 80) || customTradeId(label);
                if (!label || !isCustomTradeId(id)) return null;
                return {
                    id: id,
                    label: label,
                    sourceCategory: compactText(item && item.sourceCategory, 100) || label
                };
            })
            .filter(Boolean)
            .filter(function uniqueCustom(item, index, all) {
                return all.findIndex(function same(candidate) { return candidate.id === item.id; }) === index;
            });
        var customIds = customTrades.map(function customId(item) { return item.id; });
        var selectedTrades = (Array.isArray(profile.selectedTrades) ? profile.selectedTrades : [])
            .map(normalizeSelectedTrade)
            .filter(Boolean)
            .filter(function profileCustomExists(item) {
                return !isCustomTradeId(item.id) || customIds.indexOf(item.id) !== -1;
            })
            .filter(function uniqueTrade(item, index, all) {
                return all.findIndex(function same(candidate) { return candidate.id === item.id; }) === index;
            });
        var roomTypes = {};
        var suppliedRoomTypes = profile.roomTypes && typeof profile.roomTypes === 'object' ? profile.roomTypes : {};
        Object.keys(suppliedRoomTypes).slice(0, 200).forEach(function normalizeRoom(roomId) {
            var roomTypeId = compactText(suppliedRoomTypes[roomId], 60);
            if (getRoomType(roomTypeId)) roomTypes[compactText(roomId, 140)] = roomTypeId;
        });
        var detectedTradeIds = (Array.isArray(profile.detectedTradeIds) ? profile.detectedTradeIds : [])
            .map(function normalizeId(id) { return compactText(id, 80); })
            .filter(function validId(id) { return !!getTrade(id) || isCustomTradeId(id); })
            .filter(function uniqueId(id, index, all) { return all.indexOf(id) === index; })
            .sort();
        var detectedTradePhases = {};
        var suppliedDetectedPhases = profile.detectedTradePhases && typeof profile.detectedTradePhases === 'object'
            ? profile.detectedTradePhases
            : {};
        Object.keys(suppliedDetectedPhases).forEach(function normalizeDetectedPhases(tradeId) {
            var trade = getTrade(tradeId);
            if (!trade || !Array.isArray(trade.phases) || !trade.phases.length) return;
            var allowed = trade.phases.map(function allowedPhase(phase) { return phase.id; });
            detectedTradePhases[tradeId] = (Array.isArray(suppliedDetectedPhases[tradeId]) ? suppliedDetectedPhases[tradeId] : [])
                .map(function phaseValue(phase) { return compactText(phase, 40); })
                .filter(function validPhase(phase) { return allowed.indexOf(phase) !== -1; })
                .filter(function uniquePhase(phase, index, all) { return all.indexOf(phase) === index; })
                .sort();
        });
        return {
            version: VERSION,
            selectedTrades: selectedTrades,
            customTrades: customTrades,
            roomTypes: roomTypes,
            detectedTradeIds: detectedTradeIds,
            detectedTradePhases: detectedTradePhases,
            detectedTradeFingerprint: compactText(profile.detectedTradeFingerprint, 20),
            confirmedAt: compactText(profile.confirmedAt, 40)
        };
    }

    function selectedTrade(profile, tradeId) {
        var normalized = normalizeReviewProfile(profile);
        return normalized.selectedTrades.find(function findTrade(item) {
            return item.id === tradeId;
        }) || null;
    }

    function isTradeSelected(profile, tradeId, phases) {
        var selection = selectedTrade(profile, tradeId);
        if (!selection) return false;
        var requiredPhases = Array.isArray(phases) ? phases : [];
        if (!requiredPhases.length) return true;
        return requiredPhases.some(function selectedPhase(phase) {
            return selection.phases.indexOf(phase) !== -1;
        });
    }

    function isKnownDependency(tradeId, dependencyTradeId) {
        return KNOWN_DEPENDENCIES[String(tradeId || '') + '|' + String(dependencyTradeId || '')] === true;
    }

    function ruleApplies(ruleItem, profile, roomTypeId) {
        if (!ruleItem || !isTradeSelected(profile, ruleItem.tradeId, ruleItem.phases)) return false;
        if (ruleItem.findingKind === 'coordination') {
            if (!ruleItem.dependencyTradeId || isTradeSelected(profile, ruleItem.dependencyTradeId)) return false;
        }
        if (ruleItem.scope === 'quote') return true;
        return ruleItem.roomTypes.indexOf(roomTypeId) !== -1 || ruleItem.roomTypes.indexOf('all') !== -1;
    }

    function textContainsAny(text, values) {
        var normalized = normalizeText(text);
        return (Array.isArray(values) ? values : []).some(function contains(value) {
            var needle = normalizeText(value);
            return needle && normalized.indexOf(needle) !== -1;
        });
    }

    function getApplicableRules(profile, roomTypeId, scopeType) {
        return KNOWLEDGE_RULES.filter(function applicable(ruleItem) {
            if (scopeType === 'quote' && ruleItem.scope !== 'quote') return false;
            if (scopeType === 'room' && ruleItem.scope === 'quote') return false;
            return ruleApplies(ruleItem, profile, roomTypeId);
        });
    }

    function getApplicableCopilotRules(profile, roomTypeId, scopeType) {
        return COPILOT_RULES.filter(function applicable(ruleItem) {
            if (scopeType === 'quote' && ruleItem.scope !== 'quote') return false;
            if (scopeType === 'room' && ruleItem.scope === 'quote') return false;
            return ruleApplies(ruleItem, profile, roomTypeId);
        });
    }

    return {
        VERSION: VERSION,
        TRADE_GROUPS: TRADE_GROUPS,
        TRADES: TRADES,
        ROOM_TYPES: ROOM_TYPES,
        KNOWLEDGE_RULES: KNOWLEDGE_RULES,
        COPILOT_RULES: COPILOT_RULES,
        normalizeText: normalizeText,
        stableTextHash: stableTextHash,
        getTrade: getTrade,
        getRoomType: getRoomType,
        getRule: getRule,
        detectRoomType: detectRoomType,
        detectTradeScope: detectTradeScope,
        customTradeId: customTradeId,
        isCustomTradeId: isCustomTradeId,
        normalizeReviewProfile: normalizeReviewProfile,
        selectedTrade: selectedTrade,
        isTradeSelected: isTradeSelected,
        isKnownDependency: isKnownDependency,
        ruleApplies: ruleApplies,
        textContainsAny: textContainsAny,
        getApplicableRules: getApplicableRules,
        getApplicableCopilotRules: getApplicableCopilotRules
    };
});
