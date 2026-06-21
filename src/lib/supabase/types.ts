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
  banner_url: string | null;
  accent_color: string | null;
  theme: ThemePreference;
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
  created_at: string;
}

export interface DbServerMember {
  server_id: string;
  user_id: string;
  role: MemberRole;
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
  attachment_type: "image" | "video" | null;
  attachment_key: string | null;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
}

export interface Message extends DbMessage {
  author?: Profile;
}

export interface DbDmMessage {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  attachment_url: string | null;
  attachment_type: "image" | "video" | null;
  attachment_key: string | null;
  mentions: string[];
  created_at: string;
}

export interface DmMessage extends DbDmMessage {
  author?: Profile;
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

export type ViewMode = "home" | "server" | "dm";

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
          banner_url?: string | null;
          accent_color?: string | null;
          theme?: ThemePreference;
        };
        Update: {
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          status?: UserStatus;
          banner_url?: string | null;
          accent_color?: string | null;
          theme?: ThemePreference;
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
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
