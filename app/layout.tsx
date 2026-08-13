import type { Metadata } from "next";
import { CasesProvider } from "./lib/state";
import "./globals.css";

export const metadata: Metadata = {
  title: "KORAIL LINK",
  description: "코레일 국제복합운송 운임 인텔리전스 · Single Data Entry 플랫폼",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <CasesProvider>{children}</CasesProvider>
      </body>
    </html>
  );
}
