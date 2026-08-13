import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KORAIL LINK | 국제복합운송 견적 검증",
  description: "코레일 국제물류 담당자를 위한 AI 기반 국제복합운송 견적 검증·업무지원 플랫폼",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
