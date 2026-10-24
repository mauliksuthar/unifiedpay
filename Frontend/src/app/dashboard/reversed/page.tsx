"use client";

import { History } from "../success/page";

export default function ReversedPage() {
  return (
    <History
      title="Reversed transactions"
      bucket="reversed"
      note="Amount was approved, then reversed to the original card. Settlement to the bank is clawed back by the gateway."
    />
  );
}
