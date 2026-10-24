"use client";

import { Alert, Card } from "antd";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/PageHeading";
import { api } from "@/lib/api";
import { TxnTable } from "../page";

export default function SuccessPage() {
  return <History title="Successful transactions" bucket="success" note="Card approved. Gateway will credit your bank (net of MDR). Platform fee is invoiced separately." />;
}

export function History({
  title,
  bucket,
  note,
}: {
  title: string;
  bucket: "success" | "failed" | "reversed" | "settlement" | "all";
  note: string;
}) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.history(bucket).then((r) => setRows(r.data ?? [])).catch((e) => setError(e.message));
  }, [bucket]);

  return (
    <>
      <PageHeading title={title} subtitle={note} />
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Card>
        <TxnTable rows={rows} />
      </Card>
    </>
  );
}
