import { BotInviteCard } from "@/components/bot/BotInviteCard";

export const metadata = {
  title: "Bot Invite — Disband",
  description: "Approve or decline a bot that wants to join your server.",
};

export default async function BotInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <BotInviteCard code={code} />;
}
