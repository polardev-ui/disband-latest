"use client";

import { createContext, useContext } from "react";
import type { ContextMenuItem } from "@/components/ui/ContextMenu";
import type { ChatMessageData } from "./ChatMessage";

/**
 * The message's right-click actions, for the hover bar's Shift view (hold
 * Shift over a message, as in Discord). Provided around each chat by
 * DiscordApp, which already knows which actions apply where.
 */
export const MessageQuickActionsContext = createContext<((message: ChatMessageData) => ContextMenuItem[]) | null>(null);

export function useMessageQuickActions() {
  return useContext(MessageQuickActionsContext);
}
