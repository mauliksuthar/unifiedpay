"use client";

import { Card } from "antd";
import Link from "next/link";

export function AuthFrame({
  title,
  lead,
  children,
  footer,
  wide,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="auth-frame">
      <div className={wide ? "auth-frame-inner wide" : "auth-frame-inner"}>
        <div className="auth-intro">
          <Link href="/" className="auth-brand">
            UnifiedPay
          </Link>
          <h1>{title}</h1>
          {lead ? <p>{lead}</p> : null}
        </div>
        <Card>
          <div className="auth-body">{children}</div>
        </Card>
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </div>
    </main>
  );
}
