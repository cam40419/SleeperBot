import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Sleeper Coach", description: "Private AI fantasy football command center" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
