const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:5280";

export type TxnDetail = {
  summary: Record<string, unknown>;
  card: Record<string, unknown>;
  bank: Record<string, unknown>;
  money: Record<string, unknown>;
  gateway: Record<string, unknown>;
  refunds: Array<Record<string, unknown>>;
  timeline: Array<{ name: string; state: string; at: string; detail: string }>;
};

export type CustomerRow = {
  id: string;
  name: string;
  mobile?: string | null;
  email?: string | null;
  accountCount?: number;
  primaryBank?: string | null;
};

export type AccountRow = {
  id: string;
  label: string;
  bankName: string;
  holderName: string;
  ifsc: string;
  accountLast4: string;
  isDefault: boolean;
  isFrozen?: boolean;
  customerId?: string | null;
  customerName?: string | null;
};

export type AdminMerchant = {
  id: string;
  legalName: string;
  brandName?: string | null;
  email: string;
  mobileE164?: string | null;
  panMasked?: string | null;
  gstin?: string | null;
  mcc?: string | null;
  websiteUrl?: string | null;
  settlementIfsc?: string | null;
  settlementAccountLast4?: string | null;
  status: string;
  platformFeePercent: number;
};

export type AuthResponse = {
  accessToken: string;
  expiresIn: number;
  merchantId: string;
  apiKey: string;
  status: string;
};

function authHeader(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("up_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function adminRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? data?.title ?? res.statusText);
  return data as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.title ?? res.statusText;
    const razorpayFailure = /razorpay/i.test(String(msg));
    if (
      res.status === 401 &&
      !razorpayFailure &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login") &&
      !window.location.pathname.startsWith("/admin")
    ) {
      clearAuth();
      window.location.assign("/login");
    }
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  base: API_BASE,
  register: (body: Record<string, unknown>) =>
    request<AuthResponse>("/v1/auth/merchant/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/v1/auth/merchant/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  adminLogin: (email: string, password: string) =>
    request<{ access_token: string; expires_in: number }>("/v1/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<Record<string, unknown>>("/v1/merchants/me"),
  orders: () => request<{ data: Array<Record<string, unknown>> }>("/v1/orders"),
  createOrder: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>("/v1/orders", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getOrder: (id: string) => request<Record<string, unknown>>(`/v1/orders/${id}`),
  startPayment: (orderId: string) =>
    request<Record<string, unknown>>(`/v1/orders/${orderId}/payments`, {
      method: "POST",
      body: JSON.stringify({ rail: "CREDIT" }),
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),
  getPayment: (id: string) => request<Record<string, unknown>>(`/v1/payments/${id}`),
  transactions: () =>
    request<{ data: Array<Record<string, unknown>> }>("/v1/merchants/me/transactions"),
  history: (bucket: "success" | "failed" | "reversed" | "settlement" | "all") =>
    request<{ data: Array<Record<string, unknown>> }>(`/v1/merchants/me/history/${bucket}`),
  transaction: (id: string) => request<TxnDetail>(`/v1/merchants/me/transactions/${id}`),
  customers: (q?: string) =>
    request<{ data: CustomerRow[] }>(`/v1/merchants/me/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  addCustomer: (body: { name: string; mobile?: string; email?: string }) =>
    request<CustomerRow>("/v1/merchants/me/customers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  accounts: (q?: { customerId?: string; bank?: string }) => {
    const params = new URLSearchParams();
    if (q?.customerId) params.set("customerId", q.customerId);
    if (q?.bank) params.set("q", q.bank);
    const search = params.toString();
    return request<{ data: AccountRow[] }>(`/v1/merchants/me/accounts${search ? `?${search}` : ""}`);
  },
  addAccount: (body: {
    label: string;
    bankName: string;
    holderName: string;
    ifsc: string;
    accountNumber: string;
    customerId: string;
  }) =>
    request<AccountRow>("/v1/merchants/me/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAccount: (
    id: string,
    body: {
      label: string;
      bankName: string;
      holderName: string;
      ifsc: string;
      accountNumber?: string;
      customerId?: string | null;
    },
  ) =>
    request<AccountRow>(`/v1/merchants/me/accounts/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteAccount: (id: string) =>
    request<{ accountId: string }>(`/v1/merchants/me/accounts/${id}`, { method: "DELETE" }),
  setAccountFrozen: (id: string, frozen: boolean) =>
    request<AccountRow>(`/v1/merchants/me/accounts/${id}/freeze`, {
      method: "POST",
      body: JSON.stringify({ frozen }),
    }),
  makeAccountPrimary: (id: string) =>
    request<{ id: string; isDefault: boolean }>(`/v1/merchants/me/accounts/${id}/primary`, { method: "POST" }),
  cardToBank: (body: {
    amountPaise: number;
    settlementAccountId: string;
    cardHolderName: string;
    cardBrand: string;
    cardLast4: string;
    cardExpiry: string;
    customerEmail?: string;
  }) =>
    request<Record<string, unknown>>("/v1/merchants/me/card-to-bank", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reverse: (id: string) =>
    request<Record<string, unknown>>(`/v1/merchants/me/transactions/${id}/reverse`, { method: "POST" }),
  createRazorpayOrder: (amount: number, receipt?: string) =>
    request<{ order_id: string; amount: number; currency: string }>("/api/create-order", {
      method: "POST",
      body: JSON.stringify({ amount, currency: "INR", receipt }),
    }),
  verifyRazorpayPayment: (body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    request<{ success: boolean; paid: boolean; razorpay_payment_id: string }>("/api/verify-payment", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminMerchants: (token: string) =>
    adminRequest<{ data: AdminMerchant[] }>(token, "/v1/admin/merchants"),
  adminCreateMerchant: (token: string, body: Record<string, unknown>) =>
    adminRequest<AdminMerchant>(token, "/v1/admin/merchants", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdateMerchant: (token: string, id: string, body: Record<string, unknown>) =>
    adminRequest<AdminMerchant>(token, `/v1/admin/merchants/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  adminDeleteMerchant: (token: string, id: string) =>
    adminRequest<{ merchantId: string }>(token, `/v1/admin/merchants/${id}`, { method: "DELETE" }),
  freezeMerchant: (token: string, id: string, reason: string) =>
    fetch(`${API_BASE}/v1/admin/merchants/${id}/freeze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? res.statusText);
      return data;
    }),
  issueInvoice: (token: string, id: string) =>
    fetch(`${API_BASE}/v1/admin/merchants/${id}/invoices/weekly`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? res.statusText);
      return data;
    }),
};

export function saveAuth(auth: AuthResponse) {
  localStorage.setItem("up_token", auth.accessToken);
  localStorage.setItem("up_merchant_id", auth.merchantId);
  localStorage.setItem("up_api_key", auth.apiKey);
}

export function clearAuth() {
  localStorage.removeItem("up_token");
  localStorage.removeItem("up_merchant_id");
  localStorage.removeItem("up_api_key");
  localStorage.removeItem("up_admin_token");
}
