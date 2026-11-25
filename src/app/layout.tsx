import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ডিজিটাল সার্ভিস পয়েন্ট - DSP ePOS ও দৈনিক স্টক খতিয়ান",
  description: "ডিজিটাল সার্ভিস পয়েন্ট সেলস কাউন্টার এবং দৈনিক ক্রয়-বিক্রয় ও স্টক হিসাব",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DSP ePOS",
  },
  applicationName: "DSP ePOS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0f1d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DSP ePOS" />
        <meta name="application-name" content="DSP ePOS" />
        <meta name="theme-color" content="#0a0f1d" />
      </head>
      <body>{children}</body>
    </html>
  );
}
