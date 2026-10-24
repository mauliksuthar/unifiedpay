"use client";

import { Alert, Button, Card, Col, Row, Table, Timeline } from "antd";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/PageHeading";
import { api, TxnDetail } from "@/lib/api";

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<TxnDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.transaction(params.id).then(setData).catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function reverse() {
    setBusy(true);
    setError("");
    try {
      await api.reverse(params.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reverse failed");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="muted">Loading transaction…</p>;
  const s = data.summary;
  const rupee = (n: unknown) => `₹${(Number(n ?? 0) / 100).toFixed(2)}`;

  return (
    <>
      <Button type="link" style={{ paddingLeft: 0 }} onClick={() => router.push("/dashboard")}>
        ← Dashboard
      </Button>
      <PageHeading
        title="Transaction details"
        subtitle={`${String(s.status)} · ${String(s.merchantOrderRef)} · ${new Date(String(s.createdAt)).toLocaleString()}`}
      />
      <Row gutter={[24, 24]}>
        <Col xs={24} md={8}>
          <Card title="Card" style={{ height: "100%" }}>
            <p>
              {String(data.card.brand)} {String(data.card.masked)}
            </p>
            <p className="muted">
              {String(data.card.holder)} · exp {String(data.card.expiry)}
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {String(data.card.stored)}
            </p>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Bank" style={{ height: "100%" }}>
            <p>{String(data.bank.beneficiary)}</p>
            <p className="muted">
              {String(data.bank.ifsc)} · {String(data.bank.accountMasked)}
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {String(data.bank.settledBy)}
            </p>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Money" style={{ height: "100%" }}>
            <p>Gross {rupee(data.money.grossPaise)}</p>
            <p>Net to bank {rupee(data.money.netToMerchantBankPaise)}</p>
            <p>Our fee {rupee(data.money.unifiedPayFeePaise)}</p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {String(data.money.feePath)}
            </p>
          </Card>
        </Col>
      </Row>
      <Card title="Gateway" style={{ marginTop: 24 }}>
        <p>
          Code {String(data.gateway.gatewayCode)} · PSP {String(data.gateway.pspRef ?? "—")}
        </p>
        <p>UTR {String(data.gateway.utr ?? "—")}</p>
        <p>
          Failure {String(data.gateway.failureCode ?? "—")} {String(data.gateway.failureMessage ?? "")}
        </p>
        <p>Settlement status {String(s.settlementStatus)}</p>
        {String(s.status) === "Success" ? (
          <Button type="primary" disabled={busy} onClick={reverse}>
            {busy ? "Reversing…" : "Reverse this transaction"}
          </Button>
        ) : null}
        {error ? <Alert type="error" showIcon title={error} style={{ marginTop: 16 }} /> : null}
      </Card>
      <Card title="Process timeline" style={{ marginTop: 24 }}>
        <Timeline
          items={data.timeline.map((step) => ({
            key: step.name,
            color: step.state === "done" ? "green" : step.state === "failed" ? "red" : "blue",
            title: step.name,
            content: (
              <>
                <div className="muted">
                  {step.state} · {new Date(step.at).toLocaleString()}
                </div>
                <div>{step.detail}</div>
              </>
            ),
          }))}
        />
      </Card>
      <Card title="Reversals" style={{ marginTop: 24 }}>
        {data.refunds.length === 0 ? (
          <p className="muted">No reversal on this payment.</p>
        ) : (
          <Table
            rowKey={(r) => String(r.id)}
            dataSource={data.refunds}
            pagination={false}
            scroll={{ x: 720 }}
            columns={[
              { title: "When", dataIndex: "createdAt", render: (v) => new Date(String(v)).toLocaleString() },
              { title: "Amount", dataIndex: "amountPaise", render: (v) => rupee(v) },
              { title: "Reason", dataIndex: "reason", render: (v) => String(v) },
              { title: "Status", dataIndex: "status", render: (v) => String(v) },
              { title: "PSP ref", dataIndex: "pspRefundRef", render: (v) => String(v) },
            ]}
          />
        )}
        <Button style={{ marginTop: 12 }} onClick={() => router.push("/dashboard/reversed")}>
          All reversed
        </Button>
      </Card>
    </>
  );
}
