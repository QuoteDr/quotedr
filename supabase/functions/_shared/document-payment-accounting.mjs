function nonNegativeCents(value) {
  const cents = Math.round(Number(value || 0));
  return Number.isFinite(cents) ? Math.max(0, cents) : 0;
}

function rowData(row) {
  return row && row.data && typeof row.data === 'object' ? row.data : {};
}

export function canonicalDocumentTotalCents(row) {
  const data = rowData(row);
  // quotes.total is written from the server-calculated signed document. Older
  // accepted_total_cents snapshots can omit client-selected upgrades.
  const signedTotal = Number(row?.total ?? row?.grand_total ?? data.grandTotal ?? data.total ?? 0);
  if (Number.isFinite(signedTotal) && signedTotal > 0) return Math.round(signedTotal * 100);
  const legacyAccepted = Number(data.accepted_total_cents || 0);
  return Number.isInteger(legacyAccepted) && legacyAccepted > 0 ? legacyAccepted : 0;
}

export function existingPaidCents(row) {
  const data = rowData(row);
  const received = data.paymentsReceived || data.paymentReceived || {};
  const amount = Number(received.amount || received.value || 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export function legacyUnlinkedPaidCents(row) {
  const data = rowData(row);
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const linkedSnapshotCents = payments.reduce((sum, payment) => {
    if (!payment?.payment_record_id) return sum;
    return sum + nonNegativeCents(payment.amount_cents);
  }, 0);
  return Math.max(0, existingPaidCents(row) - linkedSnapshotCents);
}

export function calculateRecordedPaymentState(row, records, requestedDepositCents) {
  const secured = (Array.isArray(records) ? records : []).filter(record => ['paid', 'confirmed'].includes(record?.status));
  const recordPaidCents = secured.reduce((sum, record) => sum + nonNegativeCents(record.amount_cents), 0);
  const paidCents = recordPaidCents + legacyUnlinkedPaidCents(row);
  const totalCents = canonicalDocumentTotalCents(row);
  const requiredCents = Math.min(totalCents, nonNegativeCents(requestedDepositCents));
  return {
    secured,
    totalCents,
    paidCents,
    balanceDueCents: Math.max(0, totalCents - paidCents),
    depositDueCents: Math.max(0, requiredCents - paidCents),
    depositSecured: requiredCents > 0 && paidCents >= requiredCents,
    fullPaid: totalCents > 0 && paidCents >= totalCents,
  };
}
