"use client";

import { Alert, Button, Card, Col, Empty, Input, Modal, Popconfirm, Row, Select, Tag } from "antd";
import { useEffect, useState } from "react";
import { accountMatches } from "@/components/AccountChoices";
import { BankAccountModal } from "@/components/BankAccountModal";
import { PageHeading } from "@/components/PageHeading";
import { api, type AccountRow, type CustomerRow } from "@/lib/api";

const emptyCustomer = { name: "", mobile: "", email: "" };

export default function AccountsPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(emptyCustomer);
  const [editorCustomerId, setEditorCustomerId] = useState("");
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [editForm, setEditForm] = useState({ label: "", bankName: "", holderName: "", ifsc: "", accountNumber: "", customerId: "" });
  const [savingAccount, setSavingAccount] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [acct, cust] = await Promise.all([api.accounts(), api.customers()]);
    setAccounts(acct.data ?? []);
    setCustomers(cust.data ?? []);
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load accounts"))
      .finally(() => setLoading(false));
  }, []);

  const customerTerm = customerQuery.trim().toLowerCase();
  const visibleCustomers = customers.filter((customer) => {
    const nameHit =
      !customerTerm ||
      `${customer.name} ${customer.mobile ?? ""} ${customer.email ?? ""}`.toLowerCase().includes(customerTerm);
    if (!nameHit) return false;
    if (!bankQuery.trim()) return true;
    return accounts.some((account) => account.customerId === customer.id && accountMatches(account, customer.id, bankQuery));
  });
  const unlinked = customerTerm
    ? []
    : accounts.filter((account) => !account.customerId && accountMatches(account, "", bankQuery));

  async function saveCustomer() {
    setError("");
    if (draft.name.trim().length < 2) {
      setError("Enter the customer name.");
      return;
    }
    if (draft.email.trim() && !draft.email.includes("@")) {
      setError("Enter a valid email or leave it blank.");
      return;
    }
    setSavingCustomer(true);
    try {
      await api.addCustomer({
        name: draft.name.trim(),
        mobile: draft.mobile.trim() || undefined,
        email: draft.email.trim() || undefined,
      });
      setDraft(emptyCustomer);
      setAddOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add customer");
    } finally {
      setSavingCustomer(false);
    }
  }

  function openEdit(account: AccountRow) {
    setError("");
    setEditing(account);
    setEditForm({
      label: account.label,
      bankName: account.bankName,
      holderName: account.holderName,
      ifsc: account.ifsc,
      accountNumber: "",
      customerId: account.customerId ?? "",
    });
  }

  async function saveAccount() {
    if (!editing) return;
    if (!editForm.bankName.trim() || !editForm.holderName.trim()) {
      setError("Enter the bank name and account holder.");
      return;
    }
    if (editForm.ifsc.trim().length !== 11) {
      setError("IFSC must be 11 characters.");
      return;
    }
    if (editForm.accountNumber.trim() && editForm.accountNumber.trim().length < 6) {
      setError("Enter the full account number, or leave it blank.");
      return;
    }
    setSavingAccount(true);
    setError("");
    try {
      await api.updateAccount(editing.id, {
        label: editForm.label.trim(),
        bankName: editForm.bankName.trim(),
        holderName: editForm.holderName.trim(),
        ifsc: editForm.ifsc.trim().toUpperCase(),
        accountNumber: editForm.accountNumber.trim() || undefined,
        customerId: editForm.customerId || null,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the account");
    } finally {
      setSavingAccount(false);
    }
  }

  async function removeAccount(id: string) {
    setError("");
    setPendingId(id);
    try {
      await api.deleteAccount(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account");
    } finally {
      setPendingId("");
    }
  }

  async function toggleFreeze(account: AccountRow) {
    setError("");
    setPendingId(account.id);
    try {
      await api.setAccountFrozen(account.id, !account.isFrozen);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update freeze");
    } finally {
      setPendingId("");
    }
  }

  function renderAccount(account: AccountRow) {
    return (
      <div key={account.id} className={`account static${account.isDefault && !account.isFrozen ? " on" : ""}${account.isFrozen ? " frozen" : ""}`}>
        <span className="account-body">
          <strong>{account.label}</strong> · {account.bankName}
          <div className="muted">
            {account.holderName} · {account.ifsc} · ****{account.accountLast4}
          </div>
        </span>
        <span className="account-action" style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {account.isFrozen ? <Tag>Frozen</Tag> : null}
          {account.isDefault && !account.isFrozen ? <Tag color="blue">Primary</Tag> : null}
          {!account.isDefault && !account.isFrozen ? (
            <Button type="link" loading={pendingId === account.id} onClick={() => void makePrimary(account.id)}>
              Make primary
            </Button>
          ) : null}
          <Button type="link" onClick={() => openEdit(account)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this bank account?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => void removeAccount(account.id)}
          >
            <Button type="link" danger>
              Delete
            </Button>
          </Popconfirm>
          <Button type="link" loading={pendingId === account.id} onClick={() => void toggleFreeze(account)}>
            {account.isFrozen ? "Unfreeze" : "Freeze"}
          </Button>
        </span>
      </div>
    );
  }

  async function makePrimary(id: string) {
    setError("");
    setPendingId(id);
    try {
      await api.makeAccountPrimary(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the primary account");
    } finally {
      setPendingId("");
    }
  }

  return (
    <>
      <PageHeading
        title="Accounts"
        subtitle="Bank accounts grouped by customer. The first account for a customer is primary until you choose another."
      />
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <label className="field">
              <span>Customer</span>
              <Input
                allowClear
                placeholder="Search customer, mobile, or email"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
              />
            </label>
          </Col>
          <Col xs={24} md={12}>
            <label className="field">
              <span>Bank</span>
              <Input
                allowClear
                placeholder="Search bank, IFSC, or account"
                value={bankQuery}
                onChange={(e) => setBankQuery(e.target.value)}
              />
            </label>
          </Col>
        </Row>
        <Button type="primary" onClick={() => setAddOpen(true)}>
          Add customer
        </Button>
      </Card>

      {loading ? <p className="muted">Loading accounts…</p> : null}
      {!loading && visibleCustomers.length === 0 && unlinked.length === 0 ? (
        <Empty description="No customer matches. Add a customer, then add their bank account." />
      ) : null}

      {visibleCustomers.map((customer) => {
        const rows = accounts.filter((account) => account.customerId === customer.id);
        const shown = rows.filter((account) => accountMatches(account, customer.id, bankQuery));
        const primary = rows.find((account) => account.isDefault);
        return (
          <Card
            key={customer.id}
            style={{ marginBottom: 16 }}
            title={
              <span>
                {customer.name}
                {primary ? (
                  <Tag color="blue" style={{ marginLeft: 8 }}>
                    Primary · {primary.bankName}
                  </Tag>
                ) : null}
              </span>
            }
            extra={
              <Button
                onClick={() => {
                  setError("");
                  setEditorCustomerId(customer.id);
                }}
              >
                Add account
              </Button>
            }
          >
            <p className="muted">{[customer.mobile, customer.email].filter(Boolean).join(" · ") || "No mobile or email"}</p>
            {shown.length === 0 ? <p className="muted">No bank account yet.</p> : null}
            <div className="account-list">{shown.map(renderAccount)}</div>
          </Card>
        );
      })}

      {unlinked.length ? (
        <Card title="Not linked to a customer" style={{ marginTop: 8 }}>
          <p className="muted">These accounts were saved before customers existed. New accounts are added under a customer.</p>
          <div className="account-list">{unlinked.map(renderAccount)}</div>
        </Card>
      ) : null}

      <Modal
        open={addOpen}
        title="New customer"
        okText="Save customer"
        confirmLoading={savingCustomer}
        onOk={() => void saveCustomer()}
        onCancel={() => {
          setAddOpen(false);
          setDraft(emptyCustomer);
        }}
        destroyOnHidden
      >
        <label className="field">
          <span>Name</span>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Mobile</span>
          <Input value={draft.mobile} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} />
        </label>
        <label className="field">
          <span>Email</span>
          <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </label>
      </Modal>

      <Modal
        open={editing !== null}
        title="Edit bank account"
        okText="Save changes"
        confirmLoading={savingAccount}
        onOk={() => void saveAccount()}
        onCancel={() => {
          setEditing(null);
          setError("");
        }}
        destroyOnHidden
        width={560}
      >
        <label className="field">
          <span>Customer</span>
          <Select
            showSearch
            allowClear
            placeholder="No customer"
            optionFilterProp="label"
            style={{ width: "100%" }}
            value={editForm.customerId || undefined}
            onChange={(value) => setEditForm({ ...editForm, customerId: value ?? "" })}
            options={customers.map((customer) => ({
              value: customer.id,
              label: customer.mobile ? `${customer.name} · ${customer.mobile}` : customer.name,
            }))}
          />
        </label>
        <label className="field">
          <span>Nickname</span>
          <Input value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} />
        </label>
        <label className="field">
          <span>Bank name</span>
          <Input value={editForm.bankName} onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })} />
        </label>
        <label className="field">
          <span>Account holder</span>
          <Input value={editForm.holderName} onChange={(e) => setEditForm({ ...editForm, holderName: e.target.value })} />
        </label>
        <label className="field">
          <span>IFSC</span>
          <Input
            value={editForm.ifsc}
            maxLength={11}
            onChange={(e) => setEditForm({ ...editForm, ifsc: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="field">
          <span>Account number (saved ****{editing?.accountLast4})</span>
          <Input
            value={editForm.accountNumber}
            placeholder="Leave blank to keep the saved account"
            onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value.replace(/\s/g, "") })}
          />
        </label>
      </Modal>

      <BankAccountModal
        open={Boolean(editorCustomerId)}
        initialMode="create"
        payAfter={false}
        lockCustomer
        customers={customers}
        accounts={accounts}
        initialCustomerId={editorCustomerId}
        onClose={() => setEditorCustomerId("")}
        onSaved={() => {
          setEditorCustomerId("");
          void load();
        }}
      />
    </>
  );
}
