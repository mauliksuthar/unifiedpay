"use client";

import { History } from "../success/page";

export default function FailedPage() {
  return (
    <History
      title="Failed transactions"
      bucket="failed"
      note="Declined or timed out. Nothing is credited to the bank. Open a row for the failure code and timeline."
    />
  );
}
