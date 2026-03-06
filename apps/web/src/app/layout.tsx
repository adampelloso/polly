import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polly | PvP Prediction Market Parlays",
  description:
    "Your read vs. everyone else's. PvP prediction market contests on Polymarket.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto max-w-5xl px-4 py-8 pb-20 sm:pb-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
