export type ThemePreference = "light" | "dark" | "midnight" | "sunset" | string;
export type UserStatus = "online" | "idle" | "dnd" | "offline";
export type FriendshipStatus = "pending" | "accepted" | "blocked";
export type MemberRole = "owner" | "admin" | "moderator" | "member";
export type ChannelType = "text" | "voice";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  status: UserStatus;
  preferred_status: UserStatus | null;
  banner_url: string | null;
  accent_color: string | null;
  accent_color_2: string | null;
  is_bot?: boolean;
  theme: ThemePreference;
  avatar_crop: { zoom: number; x: number; y: number } | null;
  show_owner_badge: boolean;
  show_staff_badge: boolean;
  show_og_badge: boolean;
  show_bounty_badge: boolean;
  subscription_plan?: string;
  sound_enabled?: boolean;
  desktop_notifications_enabled?: boolean;
  link_previews_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbFriendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
}

export interface Friendship extends DbFriendship {
  requester?: Profile;
  addressee?: Profile;
}

export interface Server {
  id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  description: string | null;
  owner_id: string;
  invite_code?: string;
  discoverable?: boolean;
  verified?: boolean;
  created_at: string;
}

export interface ChannelEffects {
  can_view: boolean;
  can_post: boolean;
  can_react: boolean;
  can_attach: boolean;
}

export interface ServerRole {
  id: string;
  server_id: string;
  name: string;
  color: string;
  permissions: {
    kick?: boolean;
    ban?: boolean;
    manage_roles?: boolean;
    manage_server?: boolean;
    manage_channels?: boolean;
    manage_messages?: boolean;
    manage_emojis?: boolean;
    mention_everyone?: boolean;
    send_messages?: boolean;
    add_reactions?: boolean;
    attach_files?: boolean;
  };
  position: number;
  is_default: boolean;
  created_at: string;
}

export interface DbServerMember {
  server_id: string;
  user_id: string;
  role: MemberRole;
  role_id: string | null;
  joined_at: string;
}

/** A row in the member_roles join table (one member can hold many roles). */
export interface MemberRoleRow {
  server_id: string;
  user_id: string;
  role_id: string;
}

export interface ServerMember extends DbServerMember {
  profile?: Profile;
  /** All roles assigned to this member (source of truth: member_roles). */
  role_ids?: string[];
}

export interface DbServerBoost {
  id: number;
  server_id: string;
  user_id: string;
  created_at: string;
}

export interface ChannelCategory {
  id: string;
  server_id: string;
  name: string;
  position: number;
}

export interface Channel {
  id: string;
  server_id: string;
  category_id: string | null;
  name: string;
  type: ChannelType;
  position: number;
  /** Announcement channel: everyone reads, only manage_channels may post. */
  read_only?: boolean;
  created_at: string;
}

export interface DbMessage {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  attachment_url: string | null;
  attachment_type: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
  attachment_key: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  display_id: number;
}

export interface Message extends DbMessage {
  author?: Profile;
  /** Client-side only: tracks optimistic send state */
  sending?: boolean;
}

export interface DbDmMessage {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  attachment_url: string | null;
  attachment_type: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
  attachment_key: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  display_id: number;
}

export interface DmMessage extends DbDmMessage {
  author?: Profile;
  sending?: boolean;
}

/** A single entry in the user's private Notes space. */
export interface DbNote {
  id: string;
  user_id: string;
  content: string;
  attachment_url: string | null;
  attachment_type: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
  attachment_key: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  pinned: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface Note extends DbNote {
  sending?: boolean;
  uploadProgress?: number;
}

export interface DbDmThread {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
}

export interface DmThread extends DbDmThread {
  friend?: Profile;
}

export interface GroupChat {
  id: string;
  name: string;
  owner_id: string;
  icon_url: string | null;
  created_at: string;
}

export interface GroupChatMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  author_id: string | null;
  content: string;
  attachment_url: string | null;
  attachment_type: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
  attachment_key: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  display_id: number;
  author?: Profile;
  sending?: boolean;
}

export interface GroupChatWithMembers extends GroupChat {
  members: Profile[];
}

/** Source of a pinned message: which conversation it belongs to. */
export type PinnedSourceType = "dm" | "group" | "channel";

/** A row from the `get_pinned_messages` RPC. */
export interface PinnedMessage {
  id: string;
  message_id: string;
  content: string;
  author_id: string;
  pinner_id: string;
  created_at: string;
}

export interface DbVoicePresence {
  channel_id: string;
  user_id: string;
  joined_at: string;
  muted: boolean;
  deafened: boolean;
}

export interface VoicePresence extends DbVoicePresence {
  profile?: Profile;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface CustomEmoji {
  id: number;
  server_id: string;
  name: string;
  url: string;
  uploader_id: string | null;
  created_at: string;
}

export type ViewMode = "home" | "server" | "dm" | "group" | "notes" | "discover";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          status?: UserStatus;
          preferred_status?: UserStatus | null;
          banner_url?: string | null;
          accent_color?: string | null;
          accent_color_2?: string | null;
          theme?: ThemePreference;
          sound_enabled?: boolean;
          desktop_notifications_enabled?: boolean;
          link_previews_enabled?: boolean;
        };
        Update: {
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          status?: UserStatus;
          preferred_status?: UserStatus | null;
          banner_url?: string | null;
          accent_color?: string | null;
          accent_color_2?: string | null;
          theme?: ThemePreference;
          sound_enabled?: boolean;
          desktop_notifications_enabled?: boolean;
          link_previews_enabled?: boolean;
        };
        Relationships: [];
      };
      friendships: {
        Row: DbFriendship;
        Insert: {
          requester_id: string;
          addressee_id: string;
          status?: FriendshipStatus;
        };
        Update: { status?: FriendshipStatus };
        Relationships: [];
      };
      servers: {
        Row: Server;
        Insert: {
          name: string;
          owner_id: string;
          icon_url?: string | null;
          banner_url?: string | null;
          description?: string | null;
        };
        Update: {
          name?: string;
          icon_url?: string | null;
          banner_url?: string | null;
          description?: string | null;
        };
        Relationships: [];
      };
      server_boosts: {
        Row: DbServerBoost;
        Insert: { server_id: string; user_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      server_members: {
        Row: DbServerMember;
        Insert: { server_id: string; user_id: string; role?: MemberRole };
        Update: { role?: MemberRole };
        Relationships: [];
      };
      channel_categories: {
        Row: ChannelCategory;
        Insert: { server_id: string; name: string; position?: number };
        Update: Partial<ChannelCategory>;
        Relationships: [];
      };
      channels: {
        Row: Channel;
        Insert: {
          server_id: string;
          name: string;
          type: ChannelType;
          category_id?: string | null;
          position?: number;
        };
        Update: Partial<Channel>;
        Relationships: [];
      };
      messages: {
        Row: DbMessage;
        Insert: {
          channel_id: string;
          author_id: string;
          content?: string;
          attachment_url?: string | null;
          attachment_type?: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
          attachment_key?: string | null;
          mentions?: string[];
        };
        Update: {
          content?: string;
          attachment_url?: string | null;
          attachment_type?: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
          attachment_key?: string | null;
          mentions?: string[];
          edited_at?: string | null;
        };
        Relationships: [];
      };
      dm_threads: {
        Row: DbDmThread;
        Insert: { user_a: string; user_b: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      dm_messages: {
        Row: DbDmMessage;
        Insert: {
          thread_id: string;
          author_id: string;
          content?: string;
          attachment_url?: string | null;
          attachment_type?: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
          attachment_key?: string | null;
          mentions?: string[];
        };
        Update: {
          content?: string;
          attachment_url?: string | null;
          attachment_type?: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
          attachment_key?: string | null;
          mentions?: string[];
        };
        Relationships: [];
      };
      notes: {
        Row: DbNote;
        Insert: {
          user_id: string;
          content?: string;
          attachment_url?: string | null;
          attachment_type?: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
          attachment_key?: string | null;
          attachment_name?: string | null;
          attachment_size?: number | null;
          reply_to_id?: string | null;
          pinned?: boolean;
        };
        Update: {
          content?: string;
          attachment_url?: string | null;
          attachment_type?: "image" | "video" | "gif" | "file" | "poll" | "audio" | null;
          attachment_key?: string | null;
          attachment_name?: string | null;
          attachment_size?: number | null;
          reply_to_id?: string | null;
          pinned?: boolean;
          edited_at?: string | null;
        };
        Relationships: [];
      };
      voice_presence: {
        Row: DbVoicePresence;
        Insert: { channel_id: string; user_id: string; muted?: boolean; deafened?: boolean };
        Update: { muted?: boolean; deafened?: boolean };
        Relationships: [];
      };
      notifications: {
        Row: AppNotification;
        Insert: {
          user_id: string;
          type: string;
          title: string;
          body?: string | null;
          link?: string | null;
        };
        Update: { read?: boolean };
        Relationships: [];
      };
      media_posts: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          caption: string | null;
          media_type: "image" | "video";
          asset_url: string;
          asset_key: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          media_type: "image" | "video";
          asset_url: string;
          asset_key?: string | null;
          title?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      custom_emoji: {
        Row: CustomEmoji;
        Insert: { server_id: string; name: string; url: string; uploader_id: string | null };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_server: {
        Args: {
          p_name: string;
          p_icon_url?: string | null;
          p_banner_url?: string | null;
          p_description?: string | null;
        };
        Returns: string;
      };
      delete_server: {
        Args: { p_server_id: string };
        Returns: undefined;
      };
      get_or_create_dm_thread: {
        Args: { p_friend_id: string };
        Returns: string;
      };
      ensure_user_profile: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      complete_signup_profile: {
        Args: {
          p_username?: string | null;
          p_display_name?: string | null;
        };
        Returns: undefined;
      };
      create_group_chat: {
        Args: { p_name: string; p_member_ids: string[] };
        Returns: string;
      };
      create_channel: {
        Args: {
          p_server_id: string;
          p_name: string;
          p_type?: "text" | "voice";
          p_category_id?: string | null;
        };
        Returns: string;
      };
      rename_channel: {
        Args: { p_channel_id: string; p_name: string };
        Returns: undefined;
      };
      delete_channel: {
        Args: { p_channel_id: string };
        Returns: undefined;
      };
      delete_server_role: {
        Args: { p_role_id: string };
        Returns: undefined;
      };
      get_channel_permissions: {
        Args: { p_channel_id: string };
        Returns: {
          role_id: string;
          role_name: string;
          role_color: string;
          is_default: boolean;
          can_view: boolean | null;
          can_post: boolean | null;
          can_react: boolean | null;
          can_attach: boolean | null;
        }[];
      };
      my_channel_effects: {
        Args: { p_server_id: string };
        Returns: {
          channel_id: string;
          can_view: boolean;
          can_post: boolean;
          can_react: boolean;
          can_attach: boolean;
        }[];
      };
      move_role: {
        Args: { p_role_id: string; p_new_position: number };
        Returns: undefined;
      };
      my_server_permissions: {
        Args: { p_server_id: string };
        Returns: Record<string, boolean>;
      };
      set_channel_role_permission: {
        Args: {
          p_channel_id: string;
          p_role_id: string;
          p_can_view?: boolean | null;
          p_can_post?: boolean | null;
          p_can_react?: boolean | null;
          p_can_attach?: boolean | null;
        };
        Returns: undefined;
      };
      remove_channel_role_permission: {
        Args: { p_channel_id: string; p_role_id: string };
        Returns: undefined;
      };
      create_category: {
        Args: { p_server_id: string; p_name: string };
        Returns: string;
      };
      rename_category: {
        Args: { p_category_id: string; p_name: string };
        Returns: undefined;
      };
      delete_category: {
        Args: { p_category_id: string };
        Returns: undefined;
      };
      move_channel: {
        Args: { p_channel_id: string; p_category_id: string | null; p_index: number };
        Returns: undefined;
      };
      move_category: {
        Args: { p_category_id: string; p_index: number };
        Returns: undefined;
      };
      pin_message: {
        Args: {
          p_source_type: "dm" | "group" | "channel";
          p_source_id: string;
          p_message_id: string;
          p_content?: string;
          p_author_id?: string | null;
        };
        Returns: string;
      };
      unpin_message: {
        Args: {
          p_source_type: "dm" | "group" | "channel";
          p_source_id: string;
          p_message_id: string;
        };
        Returns: undefined;
      };
      get_pinned_messages: {
        Args: {
          p_source_type: "dm" | "group" | "channel";
          p_source_id: string;
        };
        Returns: PinnedMessage[];
      };
      get_dm_unread: {
        Args: Record<string, never>;
        Returns: {
          thread_id: string;
          unread_count: number;
          last_read_at: string | null;
        }[];
      };
      get_group_unread: {
        Args: Record<string, never>;
        Returns: {
          group_id: string;
          unread_count: number;
          last_read_at: string | null;
        }[];
      };
      mark_dm_read: {
        Args: { p_thread_id: string };
        Returns: undefined;
      };
      mark_group_read: {
        Args: { p_group_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
