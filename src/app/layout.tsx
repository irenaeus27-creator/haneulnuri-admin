import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./globals.css";
import AuthFrame from "@/components/AuthFrame";

export const metadata: Metadata = {
  title: "하늘누리 비행교육원 관리자",
  description: "하늘누리 비행교육원 웹 관리자 프로그램",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <AuthFrame>{children}</AuthFrame>
      </body>
    </html>
  );
}
