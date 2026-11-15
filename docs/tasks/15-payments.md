# 15 · Online payments — needs owner decision before starting

**Do not start until the owner confirms:** payment provider (Stripe suggested), whether payment is
required or optional per venue, refund policy on cancellation, and which currencies (SYP is not
supported by Stripe).

## Sketch

- Stripe Checkout per reservation; bookings get `payment_status` (`unpaid`, `pending`, `paid`,
  `refunded`) and `payment_ref`.
- Seats are held for 10 minutes while the guest pays (`status = 'held'` with `expires_at`; the
  overlap constraint must include held bookings until they expire).
- Webhook `POST /api/payments/webhook` verifies the signature and marks the booking paid.
- Operator cancel → optional refund.
- Replace the "Not paid" labels with real status; Overview revenue shows collected vs expected.

## Acceptance

- [ ] Defined after the owner's decision.
