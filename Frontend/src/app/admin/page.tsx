"use client";

import { TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Input, Table } from "antd";
import { FormEvent, useState } from "react";
import { AppChrome } from "@/components/DashboardShell";
import { AuthFrame } from "@/components/AuthFrame";
import { PageHeading } from "@/components/PageHeading";
import { api } from "@/lib/api";

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [merchants, setMerchants] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await api.adminLogin(String(fd.get("email")), String(fd.get("password")));
      setToken(res.access_token);
      localStorage.setItem("up_admin_token", res.access_token);
      const list = await api.adminMerchants(res.access_token);
      setMerchants(list.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin login failed");
    }
  }

  async function freeze(id: string) {
    try {
      await api.freezeMerchant(token, id, "Phase 1 admin freeze");
      setMessage(`Frozen ${id}`);
      const list = await api.adminMerchants(token);
      setMerchants(list.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Freeze failed");
    }
  }

  async function invoice(id: string) {
    try {
      const inv = await api.issueInvoice(token, id);
      setMessage(
        `Invoice ${inv.invoiceNumber}: ₹${(Number(inv.totalPaise) / 100).toFixed(2)} → UnifiedPay fee account`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice failed");
    }
  }

  if (!token) {
    return (
      <AuthFrame title="Admin" lead="Freeze merchants · issue weekly commission invoices (fee account only).">
        <form onSubmit={login}>
          <label className="field">
            <span>Email</span>
            <Input name="email" size="large" defaultValue="admin@unifiedpay.local" required />
          </label>
          <label className="field">
            <span>Password</span>
            <Input name="password" type="password" size="large" defaultValue="ChangeMeAdmin!23" required />
          </label>
          {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
          <Button type="primary" htmlType="submit" size="large" block>
            Admin login
          </Button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <AppChrome
      brandHref="/admin"
      userName="Admin"
      groups={[
        {
          title: "Admin",
          links: [{ key: "merchants", label: "Merchants", icon: <TeamOutlined />, active: true }],
        },
      ]}
      onLogout={() => {
        localStorage.removeItem("up_admin_token");
        setToken("");
        setMerchants([]);
        setMessage("");
        setError("");
      }}
    >
      <PageHeading
        title="Merchants"
        subtitle="Freeze merchants · issue weekly commission invoices (fee account only)."
      />
      {message ? <Alert type="success" showIcon title={message} style={{ marginBottom: 16 }} /> : null}
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <div className="ant-card" style={{ background: "#fff", borderRadius: 4, padding: "0.5rem 0.25rem" }}>
        <Table
          rowKey={(m) => String(m.id)}
          dataSource={merchants}
          pagination={false}
          scroll={{ x: 720 }}
          columns={[
            {
              title: "Merchant",
              render: (_, m) => (
                <div>
                  {String(m.legalName)}
                  <div className="muted">{String(m.email)}</div>
                </div>
              ),
            },
            { title: "Status", dataIndex: "status", render: (v) => String(v) },
            { title: "Fee %", dataIndex: "platformFeePercent", render: (v) => String(v) },
            {
              title: "",
              render: (_, m) => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button onClick={() => freeze(String(m.id))}>Freeze</Button>
                  <Button type="primary" onClick={() => invoice(String(m.id))}>
                    Weekly invoice
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </AppChrome>
  );
}
