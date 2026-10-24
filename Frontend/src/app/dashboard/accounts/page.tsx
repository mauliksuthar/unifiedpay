"use client";

import { Alert, Button, Card, Empty, Input, Modal, Popconfirm, Select, Table } from "antd";
import { useEffect, useState } from "react";
import { accountDetail, accountMatches } from "@/components/AccountChoices";
import { BankAccountModal } from "@/components/BankAccountModal";
import { PageHeading } from "@/components/PageHeading";
import { api, type AccountRow, type CustomerRow } from "@/lib/api";

const emptyCustomer = { name: "", mobile: "", email: "" };

export default function AccountsPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [query, setQuery] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<string[] | null>(null);
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

  const groups = customerGroups(customers, accounts, query);
  const openKeys = query.trim()
    ? groups.filter((group) => group.accounts.length > 0).map((group) => group.key)
    : (expandedKeys ?? groups.map((group) => group.key));

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

  function accountActions(account: AccountRow) {
    return (
      <span style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
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
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Input
            allowClear
            placeholder="Search customer, mobile, email, bank, IFSC, or account"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 480, flex: "1 1 280px" }}
          />
          <Button type="primary" onClick={() => setAddOpen(true)}>
            Add customer
          </Button>
        </div>
      </Card>

      <Table
        rowKey="key"
        loading={loading}
        dataSource={groups}
        pagination={false}
        locale={{ emptyText: <Empty description="No customer matches. Add a customer, then add their bank account." /> }}
        expandable={{
          expandedRowKeys: openKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys.map(String)),
          rowExpandable: (group) => group.accounts.length > 0,
          expandedRowRender: (group) => (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={group.accounts}
              columns={[
                {
                  title: "Bank account",
                  render: (_, account) => <BankLine account={account} />,
                },
                {
                  title: "",
                  width: 340,
                  render: (_, account) => accountActions(account),
                },
              ]}
            />
          ),
        }}
        columns={[
          {
            title: "Customer",
            render: (_, group) => (
              <div>
                <strong>{group.title}</strong>
                <div className="muted">{group.contact}</div>
              </div>
            ),
          },
          {
            title: "Primary bank",
            render: (_, group) => (group.primary ? <BankLine account={group.primary} /> : <span className="muted">No primary account</span>),
          },
          {
            title: "",
            width: 140,
            render: (_, group) =>
              group.customerId ? (
                <Button
                  onClick={() => {
                    setError("");
                    setEditorCustomerId(group.customerId ?? "");
                  }}
                >
                  Add account
                </Button>
              ) : null,
          },
        ]}
      />

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

type AccountGroup = {
  key: string;
  title: string;
  contact: string;
  customerId: string | null;
  primary: AccountRow | null;
  accounts: AccountRow[];
};

function customerGroups(customers: CustomerRow[], accounts: AccountRow[], query: string): AccountGroup[] {
  const q = query.trim();
  const groups: AccountGroup[] = customers.flatMap((customer) => {
    const owned = accounts.filter((account) => account.customerId === customer.id);
    const identity = `${customer.name} ${customer.mobile ?? ""} ${customer.email ?? ""}`;
    const customerHit = !q || identity.toLowerCase().includes(q.toLowerCase());
    const matched = owned.filter((account) => accountMatches(account, "", q));
    if (q && !customerHit && matched.length === 0) return [];
    return [
      {
        key: customer.id,
        title: customer.name,
        contact: [customer.mobile, customer.email].filter(Boolean).join(" · ") || "No mobile or email",
        customerId: customer.id,
        primary: owned.find((account) => account.isDefault && !account.isFrozen) ?? null,
        accounts: q && !customerHit ? matched : owned,
      },
    ];
  });

  const unlinked = accounts.filter((account) => !account.customerId);
  const unlinkedShown = unlinked.filter((account) => accountMatches(account, "", q));
  if (unlinked.length && (!q || unlinkedShown.length)) {
    groups.push({
      key: "unlinked",
      title: "Not linked to a customer",
      contact: "These accounts were saved before customers existed.",
      customerId: null,
      primary: unlinked.find((account) => account.isDefault && !account.isFrozen) ?? null,
      accounts: q ? unlinkedShown : unlinked,
    });
  }
  return groups;
}

function BankLine({ account }: { account: AccountRow }) {
  const detail = account.isFrozen
    ? ["Frozen", account.holderName, account.ifsc, `****${account.accountLast4}`].join(" · ")
    : accountDetail(account);
  const highlighted = account.isDefault && !account.isFrozen;
  return (
    <div className={`account static${highlighted ? " on" : ""}${account.isFrozen ? " frozen" : ""}`}>
      <span className="account-body">
        <strong>{account.label}</strong> · {account.bankName}
        <div className="muted">{detail}</div>
      </span>
    </div>
  );
}
