# Ticketmaster integration plan

Saved 15 November 2026 at the user's request. Implementation is planned, not connected.

## Stage 1: discover matches and link to checkout

Add a server-side Ticketmaster connector that imports selected events through the Discovery API. Store provider and external event IDs, display match date, venue, teams and the provider purchase URL, and send the customer to the linked ticketing website to purchase. Keep API credentials on the backend. Handle pagination, rate limits, rescheduling and cancellations.

Football is available, including MLS; UK listings can also lead to partner sites. Coverage must be checked for each club and competition. Dortmund and Signal Iduna Park coverage is not confirmed. A listed event is not proof of seat inventory or permission to sell it.

Acceptance: one supported club's matches import without duplicates, updated or cancelled events reconcile, and the purchase link opens the correct provider event. OpenVenue must not issue a local booking confirmation for an externally sold seat.

## Stage 2: seek partner access

Request Ticketmaster Partner API access for the intended market, club and sales flow. A Discovery developer key is insufficient. Confirm permitted inventory, seat-selection capabilities, checkout responsibilities and production access before committing to an embedded sales experience.

Acceptance: written access approval and a working test event with documented supported operations. Do not assume approval exposes all Ticketmaster events.

## Stage 3: integrate 3D reservations for one venue

Map OpenVenue's venue, section, row and seat identifiers to the provider's inventory. Treat the provider as the authority for availability, holds, prices and sold state. A cached seat shown in 3D is not reserved until the provider accepts its hold. Handle expiration, abandoned checkout, price changes, duplicate callbacks, payment/confirmation failures, cancellations and reconciliation before release.

Acceptance: concurrent attempts cannot sell a seat twice; expired holds release correctly; the displayed seat maps to the purchased ticket; only server-verified orders become confirmed admissions.

## References

- [Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
- [Partner API](https://developer.ticketmaster.com/products-and-docs/apis/partner/)
- [MLS tickets](https://www.ticketmaster.com/mls)
- [UK football listings](https://www.ticketmaster.co.uk/browse/football-catid-11/sport-rid-10004)
- [Broader integration comparison](../integrations/ticketing-platforms.md)

Provider credentials, Dortmund coverage, commercial eligibility and live purchases remain unverified.
