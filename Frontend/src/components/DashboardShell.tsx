"use client";

import {
  BankOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CreditCardOutlined,
  LogoutOutlined,
  DashboardOutlined,
  RollbackOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Avatar, Dropdown } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearAuth } from "@/lib/api";

type NavLink = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  active?: boolean;
};

type NavGroup = { title: string; links: NavLink[] };

type Cta = { title: string; body: string; href: string; label: string };

export function AppChrome({
  brand = "UnifiedPay",
  brandHref = "/",
  groups,
  userName,
  cta,
  onLogout,
  children,
}: {
  brand?: string;
  brandHref?: string;
  groups: NavGroup[];
  userName: string;
  cta?: Cta;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(max-width: 991px)").matches) setCollapsed(true);
  }, []);

  const initial = userName.trim().charAt(0).toUpperCase() || "U";

  function linkActive(link: NavLink) {
    if (typeof link.active === "boolean") return link.active;
    return Boolean(link.href) && path === link.href;
  }

  function closeOnMobile() {
    if (window.innerWidth < 992) setCollapsed(true);
  }

  return (
    <div className={collapsed ? "ak-shell collapsed" : "ak-shell"}>
      <button className="sidebar-backdrop" type="button" aria-label="Close menu" onClick={() => setCollapsed(true)} />
      <aside className="ak-sidebar">
        <Link href={brandHref} className="sidebar-brand">
          {brand}
        </Link>
        <nav className="sidebar-nav">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="sidebar-header">{group.title}</div>
              {group.links.map((link) =>
                link.href ? (
                  <Link
                    key={link.key}
                    href={link.href}
                    className={linkActive(link) ? "sidebar-link active" : "sidebar-link"}
                    onClick={closeOnMobile}
                  >
                    <span className="sidebar-icon">{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                ) : (
                  <span key={link.key} className={linkActive(link) ? "sidebar-link active" : "sidebar-link"}>
                    <span className="sidebar-icon">{link.icon}</span>
                    <span>{link.label}</span>
                  </span>
                ),
              )}
            </div>
          ))}
        </nav>
        {cta ? (
          <div className="sidebar-cta">
            <strong>{cta.title}</strong>
            <p>{cta.body}</p>
            <Link href={cta.href} className="sidebar-cta-btn" onClick={closeOnMobile}>
              {cta.label}
            </Link>
          </div>
        ) : null}
      </aside>
      <div className="ak-main">
        <header className="ak-navbar">
          <button className="hamburger" type="button" aria-label="Toggle sidebar" onClick={() => setCollapsed((v) => !v)}>
            <span />
            <span />
            <span />
          </button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  label: "Log out",
                  onClick: onLogout,
                },
              ],
            }}
          >
            <button type="button" className="user-chip">
              <Avatar size={32} style={{ backgroundColor: "#3b7ddd", fontSize: 14 }}>
                {initial}
              </Avatar>
              <span className="user-name">{userName}</span>
            </button>
          </Dropdown>
        </header>
        <main className="ak-content">{children}</main>
        <footer className="ak-footer">
          <strong>UnifiedPay</strong>
          <span>Card collection · commission by invoice</span>
        </footer>
      </div>
    </div>
  );
}

const merchantGroups: NavGroup[] = [
  {
    title: "Pages",
    links: [
      { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
      { key: "transfer", href: "/dashboard/transfer", label: "Card to bank", icon: <CreditCardOutlined /> },
      { key: "accounts", href: "/dashboard/accounts", label: "Accounts", icon: <TeamOutlined /> },
    ],
  },
  {
    title: "Transactions",
    links: [
      { key: "success", href: "/dashboard/success", label: "Success", icon: <CheckCircleOutlined /> },
      { key: "failed", href: "/dashboard/failed", label: "Failed", icon: <CloseCircleOutlined /> },
      { key: "reversed", href: "/dashboard/reversed", label: "Reversed", icon: <RollbackOutlined /> },
      { key: "settlement", href: "/dashboard/settlement", label: "Settlement", icon: <BankOutlined /> },
    ],
  },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState("Merchant");

  useEffect(() => {
    api
      .me()
      .then((me) => setName(String(me.brandName || me.legalName || "Merchant")))
      .catch(() => undefined);
  }, []);

  return (
    <AppChrome
      brandHref="/dashboard"
      groups={merchantGroups}
      userName={name}
      cta={{
        title: "Collect a payment",
        body: "Customers pay by card. Settlement goes to the merchant bank.",
        href: "/dashboard/transfer",
        label: "Card to bank",
      }}
      onLogout={() => {
        clearAuth();
        router.push("/login");
      }}
    >
      {children}
    </AppChrome>
  );
}
