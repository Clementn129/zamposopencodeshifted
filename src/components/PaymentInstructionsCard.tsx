import { PAYMENT_DETAILS } from "@/lib/paymentDetails";

export function PaymentInstructionsCard(props: {
  amountZmw: number;
  referenceCode?: string;
}) {
  const { amountZmw, referenceCode } = props;

  return (
    <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
      <p className="font-medium">Send ZMW {amountZmw} to:</p>
      <div className="space-y-1 text-muted-foreground">
        <p>
          9331 {PAYMENT_DETAILS.momo.mtn.network}: {" "}
          <span className="font-medium text-foreground">{PAYMENT_DETAILS.momo.mtn.number}</span> ({PAYMENT_DETAILS.momo.mtn.name})
        </p>
        <p>
          9331 {PAYMENT_DETAILS.momo.airtel.network}: {" "}
          <span className="font-medium text-foreground">{PAYMENT_DETAILS.momo.airtel.number}</span> ({PAYMENT_DETAILS.momo.airtel.name})
        </p>
        {referenceCode ? (
          <p className="pt-2">
            Reference: <span className="font-medium text-foreground">{referenceCode}</span>
          </p>
        ) : null}
        <p className="pt-2 text-xs">
          Other payment options available upon request.
        </p>
      </div>
    </div>
  );
}
