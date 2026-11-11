"""Message model for Disband bots."""


class Message:
    """A message received from, or sent to, a Disband channel."""

    def __init__(self, data=None, client=None):
        data = data or {}
        self.client = client
        self.raw = data
        self.id = data.get("id")
        self.channel_id = data.get("channel_id")
        self.server_id = data.get("server_id")
        self.author = data.get("author") or None
        self.content = data.get("content") or ""
        self.reply_to_id = data.get("reply_to_id")
        self.mentions = data.get("mentions") or []
        self.embeds = data.get("embeds") or []
        self.components = data.get("components") or []
        self.interaction = data.get("interaction")
        self.webhook_id = data.get("webhook_id")
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

    def reply(self, content=None, **options):
        """Replies to this message in the same channel."""
        options.setdefault("reply_to_id", self.id)
        return self.client.send_message(self.channel_id, content, **options)

    def edit(self, content=None, **patch):
        """Edits this message."""
        if isinstance(content, dict) and not patch:
            patch = content
            content = patch.get("content")
        if content is not None:
            patch["content"] = content
        return self.client.edit_message(self.channel_id, self.id, **patch)

    def delete(self):
        """Deletes this message (messages.delete; Manage Messages for others' messages)."""
        return self.client.delete_message(self.channel_id, self.id)

    def react(self, emoji):
        """Adds the bot's reaction to this message."""
        return self.client.add_reaction(self.channel_id, self.id, emoji)

    def unreact(self, emoji):
        """Removes the bot's reaction from this message."""
        return self.client.remove_reaction(self.channel_id, self.id, emoji)

    def pin(self):
        """Pins this message."""
        return self.client.pin_message(self.channel_id, self.id)

    def unpin(self):
        """Unpins this message."""
        return self.client.unpin_message(self.channel_id, self.id)

    def __repr__(self):
        return "<Message id=%s channel=%s content=%r>" % (
            self.id,
            self.channel_id,
            (self.content or "")[:40],
        )
