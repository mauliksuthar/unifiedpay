"use client";

import { App, ConfigProvider } from "antd";

const theme = {
  token: {
    colorPrimary: "#3b7ddd",
    colorLink: "#3b7ddd",
    colorSuccess: "#1cbb8c",
    colorWarning: "#fcb92c",
    colorError: "#dc3545",
    colorInfo: "#17a2b8",
    colorText: "#495057",
    colorTextHeading: "#000000",
    colorBgLayout: "#f5f7fb",
    colorBorder: "#dee2e6",
    fontFamily: "var(--font-inter), Inter, Helvetica Neue, Arial, sans-serif",
    fontSize: 14,
    borderRadius: 4,
    borderRadiusLG: 4,
    fontWeightStrong: 600,
  },
};

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={theme}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
