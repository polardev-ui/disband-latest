"use client";

export const ACTIVITY_UPDATED_EVENT = "disband:activity-updated";

export function notifyActivityUpdated(activityId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVITY_UPDATED_EVENT, { detail: { activityId } }));
}

export function subscribeActivityUpdated(listener: (activityId?: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ activityId?: string }>).detail;
    listener(detail?.activityId);
  };
  window.addEventListener(ACTIVITY_UPDATED_EVENT, handler);
  return () => window.removeEventListener(ACTIVITY_UPDATED_EVENT, handler);
}
