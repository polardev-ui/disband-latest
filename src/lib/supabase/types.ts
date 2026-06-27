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
  theme: ThemePreference;
  avatar_crop: { zoom: number; x: number; y: number } | null;
  show_owner_badge: boolean;
  show_staff_badge: boolean;
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
  created_at: string;
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

export interface ServerMember extends DbServerMember {
  profile?: Profile;
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
  created_at: string;
}

export interface DbMessage {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  attachment_url: string | null;
  attachment_type: "image" | "video" | "gif" | "file" | null;
  attachment_key: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
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
  attachment_type: "image" | "video" | "gif" | "file" | null;
  attachment_key: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
}

export interface DmMessage extends DbDmMessage {
  author?: Profile;
  sending?: boolean;
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
  author_id: string;
  content: string;
  attachment_url: string | null;
  attachment_type: "image" | "video" | "gif" | "file" | null;
  attachment_key: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  author?: Profile;
  sending?: boolean;
}

export interface GroupChatWithMembers extends GroupChat {
  members: Profile[];
}

export interface DbVoicePresence {
  channel_id: string;
  user_id: string;
  joined_at: string;
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

export type ViewMode = "home" | "server" | "dm" | "group";

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
          attachment_type?: "image" | "video" | null;
          attachment_key?: string | null;
          mentions?: string[];
        };
        Update: {
          content?: string;
          attachment_url?: string | null;
          attachment_type?: "image" | "video" | null;
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
          attachment_type?: "image" | "video" | null;
          attachment_key?: string | null;
          mentions?: string[];
        };
        Update: {
          content?: string;
          attachment_url?: string | null;
          attachment_type?: "image" | "video" | null;
          attachment_key?: string | null;
          mentions?: string[];
        };
        Relationships: [];
      };
      voice_presence: {
        Row: DbVoicePresence;
        Insert: { channel_id: string; user_id: string };
        Update: Record<string, never>;
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
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
