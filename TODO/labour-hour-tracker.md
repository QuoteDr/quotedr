# Labour Hour Tracker

## Goal

Give contractors a reliable way to know how many labour hours were actually spent at each job site, without forcing them to start and stop timers all day.

## MVP Built In QuoteDr

- Job sites can be created manually or imported from saved quotes.
- Job sites can be pinned with Google Places autocomplete, a map marker, and a visible geofence radius.
- Mobile devices can register for tracking and post raw geofence events for review.
- Time sessions are saved as `pending_review` first.
- The Daily Review screen lets the user approve or reject sessions before they count toward real labour totals.
- Approved hours can be reviewed by job site, week, source, and quote link.
- The database is ready for a future mobile companion app to send GPS/geofence sessions into the same review flow.

## Why Daily Review Matters

Google Maps history and mobile geofencing are usually accurate, but they can miss arrivals, delay departures, or merge nearby locations. QuoteDr should treat GPS as a draft, not the final truth. The user approves sessions daily, and only approved sessions should drive profitability reporting.

## Future Mobile Companion

- Native iOS/Android app handles background geofencing.
- QuoteDr sends active job site addresses and geofence radius to the device.
- The phone records arrival/departure draft sessions.
- Draft events sync to `labor_location_events`, then become `labor_time_sessions` with `source = 'gps'` and `status = 'pending_review'`.
- QuoteDr web remains the review and reporting center.

## Next Phases

- Store latitude/longitude and geofence radius for each job site.
- Add native mobile background geofence capture.
- Add calendar-style weekly review.
- Add labour cost rates and compare actual labour cost against quoted labour.
- Add team/crew member assignment when multi-user accounts exist.
