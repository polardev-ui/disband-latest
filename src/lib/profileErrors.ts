/** Maps Supabase/Postgres profile update errors to user-friendly copy. */
export function mapProfileError(message: string, code?: string): string {
  const lower = message.toLowerCase();

  if (code === "23505" || lower.includes("profiles_username_lower_unique") || lower.includes("duplicate key")) {
    return "That username is already taken.";
  }

  if (lower.includes("username is already taken")) return "That username is already taken.";
  if (lower.includes("username is not allowed")) return "That username is not allowed.";
  if (lower.includes("bio cannot exceed")) return "Bio cannot exceed 190 characters.";
  if (lower.includes("cannot exceed")) return "Messages cannot exceed 4000 characters.";
  if (lower.includes("username twice per day")) return "You can only change your username twice per day.";
  if (lower.includes("display name 10 times")) return "You can only change your display name 10 times per day.";
  if (lower.includes("wait 20 seconds")) return "Wait 20 seconds before changing your display name again.";
  if (lower.includes("profile picture")) return message;
  if (lower.includes("profile colors")) return message;
  if (lower.includes("banner")) return message;
  if (lower.includes("letters, numbers, and underscores")) return message;

  return message;
}

/** Maps message send errors (rate limits, word/length caps, blocks) to friendly copy. */
export function mapMessageError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("too quickly")) return "You are sending messages too quickly. Slow down.";
  if (lower.includes("rate limit reached")) return "Message rate limit reached. Try again in a minute.";
  if (lower.includes("cannot exceed")) return "Messages cannot exceed 4000 characters.";
  if (lower.includes("cannot message this user")) return "You cannot message this user.";
  return message;
}

/** Maps group chat action errors (creation, messaging, etc.). */
export function mapGroupChatError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("wait 20 seconds before creating")) {
    return "Wait 20 seconds before creating another group chat.";
  }
  if (lower.includes("sending messages too quickly")) {
    return "You are sending messages too quickly. Slow down.";
  }
  if (lower.includes("message limit reached")) {
    return "Message limit reached for this group. Try again in a minute.";
  }
  return message;
}
