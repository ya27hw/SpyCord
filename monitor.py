import argparse
import logging
from pathlib import Path

import discord


class GuildMonitor(discord.Client):
    def __init__(self, *, target_guild_id: int, logger: logging.Logger, **kwargs):
        super().__init__(**kwargs)
        self.target_guild_id = target_guild_id
        self.logger = logger

    async def on_ready(self):
        self.logger.info("Logged in as %s (%s)", self.user, self.user.id)
        guild = self.get_guild(self.target_guild_id)
        if guild is None:
            self.logger.error("Guild %s was not found or is unavailable.", self.target_guild_id)
            await self.close()
            return

        self.logger.info("Monitoring guild: %s (%s)", guild.name, guild.id)

    def log_entry(
        self,
        *,
        event_type: str,
        timestamp: str,
        category_name: str,
        channel_name: str,
        author: str,
        content: str,
    ):
        self.logger.info(
            "[%s] [%s / #%s] [%s] %s: %s",
            timestamp,
            category_name,
            channel_name,
            event_type,
            author,
            content,
        )

    def should_ignore_message(self, message: discord.Message) -> bool:
        if message.guild is None or message.guild.id != self.target_guild_id:
            return True
        return bool(message.author and message.author.bot)

    @staticmethod
    def stringify_message_content(message: discord.Message) -> str:
        parts: list[str] = []

        if message.content:
            parts.append(message.content)

        if message.attachments:
            attachments = ", ".join(attachment.url for attachment in message.attachments)
            parts.append(f"[attachments] {attachments}")

        if message.embeds:
            parts.append(f"[embeds] {len(message.embeds)} embed(s)")

        return " | ".join(parts) if parts else "[no text content]"

    async def on_message(self, message: discord.Message):
        if self.should_ignore_message(message):
            return

        created_at = message.created_at.isoformat()
        author = str(message.author)
        content = self.stringify_message_content(message)
        channel_name = getattr(message.channel, "name", str(message.channel))
        category_name = getattr(getattr(message.channel, "category", None), "name", "No Category")

        self.log_entry(
            event_type="MESSAGE",
            timestamp=created_at,
            category_name=category_name,
            channel_name=channel_name,
            author=author,
            content=content,
        )

    async def on_message_edit(self, before: discord.Message, after: discord.Message):
        if self.should_ignore_message(after):
            return

        before_content = self.stringify_message_content(before)
        after_content = self.stringify_message_content(after)
        if before_content == after_content:
            return

        channel_name = getattr(after.channel, "name", str(after.channel))
        category_name = getattr(getattr(after.channel, "category", None), "name", "No Category")
        edited_at = (after.edited_at or after.created_at).isoformat()

        self.log_entry(
            event_type="EDIT",
            timestamp=edited_at,
            category_name=category_name,
            channel_name=channel_name,
            author=str(after.author),
            content=f"{before_content} -> {after_content}",
        )

    async def on_message_delete(self, message: discord.Message):
        if self.should_ignore_message(message):
            return

        channel_name = getattr(message.channel, "name", str(message.channel))
        category_name = getattr(getattr(message.channel, "category", None), "name", "No Category")

        self.log_entry(
            event_type="DELETE",
            timestamp=discord.utils.utcnow().isoformat(),
            category_name=category_name,
            channel_name=channel_name,
            author=str(message.author),
            content=self.stringify_message_content(message),
        )


def build_logger(log_file: str | None) -> logging.Logger:
    logger = logging.getLogger("guild-monitor")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    logger.propagate = False

    formatter = logging.Formatter("%(message)s")

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        file_handler = logging.FileHandler(log_path, encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


def build_intents() -> discord.Intents:
    intents = discord.Intents.default()
    intents.guilds = True
    intents.messages = True
    intents.message_content = True
    return intents


def create_client(guild_id: int, log_file: str | None) -> GuildMonitor:
    logger = build_logger(log_file)
    return GuildMonitor(
        target_guild_id=guild_id,
        logger=logger,
        intents=build_intents(),
    )


def parse_args():
    parser = argparse.ArgumentParser(
        description="Monitor messages in a specific Discord guild using a bot account."
    )
    parser.add_argument(
        "-t",
        "--token",
        required=True,
        help="Discord bot token",
    )
    parser.add_argument(
        "-g",
        "--guild-id",
        dest="guild_id",
        type=int,
        required=True,
        help="Guild ID to monitor",
    )
    parser.add_argument(
        "-l",
        "--log-file",
        dest="log_file",
        help="Optional file path to append message logs",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    client = create_client(args.guild_id, args.log_file)
    client.run(args.token)


if __name__ == "__main__":
    main()
