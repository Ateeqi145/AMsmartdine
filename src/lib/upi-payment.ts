interface UpiPaymentLinkOptions {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  note: string;
}

export function buildUpiPaymentLink({
  upiId,
  payeeName,
  amountPaise,
  note,
}: UpiPaymentLinkOptions) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("Enter a valid payment amount.");
  }

  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: (amountPaise / 100).toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}
