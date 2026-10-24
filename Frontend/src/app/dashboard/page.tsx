"use client";

import { BankOutlined, CheckCircleOutlined, CloseCircleOutlined, RollbackOutlined } from "@ant-design/icons";
import { Button, Card, Col, Empty, Row, Table, Tag } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/PageHeading";
import { api } from "@/lib/api";

export default function OverviewPage() {
  const router = useRouter();
  const [me, setMe] = useState<Record<string, unknown> | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    api.me().then(setMe).catch(() => undefined);
    api.history("all").then((r) => setRows(r.data ?? [])).catch(() => undefined);
  }, []);

  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const sum = (status: string) =>
    rows.filter((r) => r.status === status).reduce((n, r) => n + Number(r.amountPaise ?? 0), 0);

  return (
    <>
      <PageHeading
        title="Dashboard"
        subtitle={
          me
            ? `${String(me.legalName)} · settlement ${String(me.settlementIfsc)} ****${String(me.settlementAccountLast4)}`
            : "Loading profile…"
        }
      />
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} xl={6}>
          <Stat
            label="Success"
            value={String(count("Success"))}
            hint={`₹${(sum("Success") / 100).toFixed(2)}`}
            href="/dashboard/success"
            icon={<CheckCircleOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Stat label="Failed" value={String(count("Failed"))} hint="No bank credit" href="/dashboard/failed" icon={<CloseCircleOutlined />} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Stat
            label="Reversed"
            value={String(count("Reversed"))}
            hint="Returned to card"
            href="/dashboard/reversed"
            icon={<RollbackOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Stat
            label="Settlements"
            value={String(count("Success"))}
            hint="PG → your bank"
            href="/dashboard/settlement"
            icon={<BankOutlined />}
          />
        </Col>
      </Row>
      <Card title="Latest card history" style={{ marginTop: 24 }}>
        <TxnTable rows={rows.slice(0, 8)} />
        <Button type="primary" style={{ marginTop: 16 }} onClick={() => router.push("/dashboard/transfer")}>
          New card to bank transfer
        </Button>
      </Card>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="stat-link">
      <Card>
        <div className="stat-top">
          <h5 className="stat-label">{label}</h5>
          <div className="stat-icon">{icon}</div>
        </div>
        <div className="stat-value">{value}</div>
        <div className="stat-hint">{hint}</div>
      </Card>
    </Link>
  );
}

function statusColor(status: string) {
  if (status === "Success") return "success";
  if (status === "Failed") return "error";
  if (status === "Reversed") return "warning";
  return "default";
}

export function TxnTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <Empty description="No transactions yet. Start from Card to bank." />;
  return (
    <Table
      rowKey={(r) => String(r.id)}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 860 }}
      columns={[
        {
          title: "When",
          dataIndex: "createdAt",
          render: (v) => new Date(String(v)).toLocaleString(),
        },
        {
          title: "Card",
          render: (_, r) => `${String(r.cardBrand ?? "")} ${String(r.maskedCard ?? "")}`.trim(),
        },
        {
          title: "Amount",
          dataIndex: "amountPaise",
          render: (v) => `₹${(Number(v) / 100).toFixed(2)}`,
        },
        {
          title: "Bank",
          render: (_, r) => `${String(r.bankIfsc ?? "—")} ****${String(r.bankAccountLast4 ?? "")}`,
        },
        {
          title: "Status",
          dataIndex: "status",
          render: (v) => <Tag color={statusColor(String(v))}>{String(v)}</Tag>,
        },
        {
          title: "UTR",
          dataIndex: "utr",
          render: (v) => String(v ?? "—"),
        },
        {
          title: "",
          render: (_, r) => <Link href={`/dashboard/transactions/${String(r.id)}`}>Details</Link>,
        },
      ]}
    />
  );
}
