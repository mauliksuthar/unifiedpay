"use client";

import { TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Input, Modal, Popconfirm, Select, Table } from "antd";
import { FormEvent, useState } from "react";
import { AppChrome } from "@/components/DashboardShell";
import { AuthFrame } from "@/components/AuthFrame";
import { PageHeading } from "@/components/PageHeading";
import { api, type AdminMerchant } from "@/lib/api";

const emptyDraft = {
  legalName: "",
  brandName: "",
  email: "",
  password: "",
  mobileE164: "",
  pan: "",
  gstin: "",
  mcc: "5411",
  websiteUrl: "",
  settlementIfsc: "",
  settlementAccountNumber: "",
  platformFeePercent: "0.25",
  status: "Active",
};

const statuses = ["Onboarding", "Active", "Frozen", "Rejected"];

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<AdminMerchant | null | "new">(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

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

  function openCreate() {
    setError("");
    setDraft(emptyDraft);
    setEditor("new");
  }

  function openEdit(merchant: AdminMerchant) {
    setError("");
    setDraft({
      legalName: merchant.legalName,
      brandName: merchant.brandName ?? "",
      email: merchant.email,
      password: "",
      mobileE164: merchant.mobileE164 ?? "",
      pan: "",
      gstin: merchant.gstin ?? "",
      mcc: merchant.mcc || "5411",
      websiteUrl: merchant.websiteUrl ?? "",
      settlementIfsc: merchant.settlementIfsc ?? "",
      settlementAccountNumber: "",
      platformFeePercent: String(merchant.platformFeePercent ?? 0.25),
      status: merchant.status || "Active",
    });
    setEditor(merchant);
  }

  async function saveMerchant() {
    if (!token || !editor) return;
    const creating = editor === "new";
    const fee = Number(draft.platformFeePercent);
    if (!draft.legalName.trim() || !draft.email.trim()) {
      setError("Legal name and email are required.");
      return;
    }
    if (creating && draft.password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (draft.password.trim() && draft.password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if ((creating || draft.pan.trim()) && draft.pan.trim().length < 10) {
      setError("PAN must be 10 characters.");
      return;
    }
    if ((creating || draft.settlementIfsc.trim()) && draft.settlementIfsc.trim().length !== 11) {
      setError("IFSC must be 11 characters.");
      return;
    }
    if ((creating || draft.settlementAccountNumber.trim()) && draft.settlementAccountNumber.trim().length < 4) {
      setError("Enter the settlement account number.");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      setError("Fee percent must be between 0 and 100.");
      return;
    }

    const body = {
      legalName: draft.legalName.trim(),
      brandName: draft.brandName.trim() || null,
      email: draft.email.trim(),
      password: draft.password.trim() || null,
      mobileE164: draft.mobileE164.trim(),
      pan: draft.pan.trim() || null,
      gstin: draft.gstin.trim() || null,
      mcc: draft.mcc.trim() || "5411",
      websiteUrl: draft.websiteUrl.trim(),
      settlementIfsc: draft.settlementIfsc.trim(),
      settlementAccountNumber: draft.settlementAccountNumber.trim() || null,
      platformFeePercent: fee,
      status: draft.status,
    };

    setSaving(true);
    setError("");
    try {
      if (creating) await api.adminCreateMerchant(token, body);
      else await api.adminUpdateMerchant(token, editor.id, body);
      setEditor(null);
      setMessage(creating ? "Merchant added." : "Merchant updated.");
      const list = await api.adminMerchants(token);
      setMerchants(list.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save merchant");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await api.adminDeleteMerchant(token, id);
      setMessage("Merchant deleted.");
      const list = await api.adminMerchants(token);
      setMerchants(list.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
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
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          Add merchant
        </Button>
      </div>
      {message ? <Alert type="success" showIcon title={message} style={{ marginBottom: 16 }} /> : null}
      {error && !editor ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <div className="ant-card" style={{ background: "#fff", borderRadius: 4, padding: "0.5rem 0.25rem" }}>
        <Table
          rowKey={(m) => m.id}
          dataSource={merchants}
          pagination={false}
          columns={[
            {
              title: "Merchant",
              render: (_, m) => (
                <div>
                  {m.legalName}
                  <div className="muted">{m.email}</div>
                </div>
              ),
            },
            { title: "Status", dataIndex: "status", width: 120 },
            { title: "Fee %", dataIndex: "platformFeePercent", width: 90 },
            {
              title: "",
              render: (_, m) => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Button onClick={() => openEdit(m)}>Edit</Button>
                  <Popconfirm
                    title="Delete this merchant?"
                    description="Customers, bank accounts, and transactions for this merchant are removed."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove(m.id)}
                  >
                    <Button danger>Delete</Button>
                  </Popconfirm>
                  <Button onClick={() => freeze(m.id)}>Freeze</Button>
                  <Button type="primary" onClick={() => invoice(m.id)}>
                    Weekly invoice
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
      <Modal
        open={editor !== null}
        title={editor === "new" ? "Add merchant" : "Edit merchant"}
        okText={editor === "new" ? "Add merchant" : "Save changes"}
        confirmLoading={saving}
        onOk={() => void saveMerchant()}
        onCancel={() => {
          setEditor(null);
          setError("");
        }}
        destroyOnHidden
        width={640}
      >
        {error && editor ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
        <label className="field">
          <span>Legal name</span>
          <Input value={draft.legalName} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} />
        </label>
        <label className="field">
          <span>Brand name</span>
          <Input value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} />
        </label>
        <label className="field">
          <span>Email</span>
          <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </label>
        <label className="field">
          <span>{editor === "new" ? "Password" : "New password"}</span>
          <Input
            type="password"
            value={draft.password}
            placeholder={editor === "new" ? "" : "Leave blank to keep the current password"}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Mobile</span>
          <Input value={draft.mobileE164} onChange={(e) => setDraft({ ...draft, mobileE164: e.target.value })} />
        </label>
        <label className="field">
          <span>{editor === "new" ? "PAN" : `PAN (saved ${editor?.panMasked || "masked"})`}</span>
          <Input
            value={draft.pan}
            maxLength={10}
            placeholder={editor === "new" ? "" : "Leave blank to keep the saved PAN"}
            onChange={(e) => setDraft({ ...draft, pan: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="field">
          <span>GSTIN</span>
          <Input value={draft.gstin} onChange={(e) => setDraft({ ...draft, gstin: e.target.value })} />
        </label>
        <label className="field">
          <span>MCC</span>
          <Input value={draft.mcc} onChange={(e) => setDraft({ ...draft, mcc: e.target.value })} />
        </label>
        <label className="field">
          <span>Website</span>
          <Input value={draft.websiteUrl} onChange={(e) => setDraft({ ...draft, websiteUrl: e.target.value })} />
        </label>
        <label className="field">
          <span>Settlement IFSC</span>
          <Input
            value={draft.settlementIfsc}
            maxLength={11}
            onChange={(e) => setDraft({ ...draft, settlementIfsc: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="field">
          <span>
            {editor === "new"
              ? "Settlement account number"
              : `Settlement account (saved ****${editor?.settlementAccountLast4 || ""})`}
          </span>
          <Input
            value={draft.settlementAccountNumber}
            placeholder={editor === "new" ? "" : "Leave blank to keep the saved account"}
            onChange={(e) => setDraft({ ...draft, settlementAccountNumber: e.target.value.replace(/\s/g, "") })}
          />
        </label>
        <label className="field">
          <span>Fee %</span>
          <Input
            value={draft.platformFeePercent}
            onChange={(e) => setDraft({ ...draft, platformFeePercent: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Status</span>
          <Select
            style={{ width: "100%" }}
            value={draft.status}
            onChange={(status) => setDraft({ ...draft, status })}
            options={statuses.map((status) => ({ value: status, label: status }))}
          />
        </label>
      </Modal>
    </AppChrome>
  );
}
