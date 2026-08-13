import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CasesProvider } from "./lib/state";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KORAIL LINK",
  description: "코레일 국제복합운송 운임 인텔리전스 · Single Data Entry 플랫폼",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CasesProvider>{children}</CasesProvider>
      </body>
    </html>
  );
}
