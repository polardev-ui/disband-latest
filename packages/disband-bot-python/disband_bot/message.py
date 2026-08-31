"""Message model for Disband bots."""


class Message:
    """A message received from, or sent to, a Disband channel."""

    def __init__(self, data, client):
        self.client = client
        self.id = data.get("id")
        self.channel_id = data.get("channel_id")
        self.server_id = data.get("server_id")
        self.author = data.get("author") or None
        self.content = data.get("content") or ""
        self.reply_to_id = data.get("reply_to_id")
        self.mentions = data.get("mentions") or []
        attachment_url = data.get("attachment_url")
        self.attachment = (
            {"url": attachment_url, "type": data.get("attachment_type")}
            if attachment_url
            else None
        )
        self.created_at = data.get("created_at")
        self.edited_at = data.get("edited_at")
        self.display_id = data.get("display_id")

    @property
    def author_is_bot(self):
        author = self.author or {}
        return bool(author.get("is_bot"))

    def reply(self, content):
        """Replies to this message in the same channel."""
        return self.client.send_message(self.channel_id, content, reply_to_id=self.id)

    def __repr__(self):
        return "<Message id=%s channel=%s content=%r>" % (
            self.id,
            self.channel_id,
            self.content[:40],
        )
