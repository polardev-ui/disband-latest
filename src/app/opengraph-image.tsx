import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/og-card";

export const alt = "Disband — A place for your people to talk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const dynamic = "force-static";

export default function OpenGraphImage() {
  return new ImageResponse(<OgCard />, size);
}
