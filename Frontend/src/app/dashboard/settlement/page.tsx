"use client";

import { History } from "../success/page";

export default function SettlementPage() {
  return (
    <History
      title="Settlement process"
      bucket="settlement"
      note="Each successful payment shows gross, gateway MDR, net to your bank, UTR, and the UnifiedPay commission invoice path. Open Details for every step."
    />
  );
}
