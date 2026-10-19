import { getStatusSnapshot } from "@/lib/status-data";
import { INCIDENT_STATUS_LABEL, type StatusIncident } from "@/lib/status";

export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function incidentDescription(incident: StatusIncident): string {
  const latest = incident.updates[incident.updates.length - 1];
  return [
    INCIDENT_STATUS_LABEL[incident.status],
    latest?.body ?? incident.title,
    incident.resolved_at ? `Resolved ${new Date(incident.resolved_at).toUTCString()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function GET() {
  const snapshot = await getStatusSnapshot();
  const items = snapshot.incidents
    .filter((incident) => incident.kind !== "announcement" || incident.status === "published")
    .slice(0, 25)
    .map((incident) => {
      const url = `https://www.disband.dev/status/incidents/${incident.id}`;
      return `    <item>
      <title>${escapeXml(incident.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${new Date(incident.created_at).toUTCString()}</pubDate>
      <description>${escapeXml(incidentDescription(incident))}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Disband Status</title>
    <link>https://www.disband.dev/status</link>
    <description>Incidents, maintenance and announcements from Disband.</description>
    <language>en-gb</language>
    <lastBuildDate>${new Date(snapshot.generated_at).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
