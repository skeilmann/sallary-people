import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { IntlProvider } from "@/components/IntlProvider";
import { Navigation } from "@/components/Navigation";
import { AuthProvider } from "@/lib/auth-context";
import { MigrationBanner } from "@/components/MigrationBanner";
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
  title: "Bonus Calculator",
  description: "Calculate and track employee bonuses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <IntlProvider>
          <AuthProvider>
            <MigrationBanner />
            <Navigation />
            <main>{children}</main>
          </AuthProvider>
        </IntlProvider>
      </body>
    </html>
  );
}
