import argparse
import logging
from pathlib import Path
from typing import Iterable

import aiohttp
import discord
from discord.abc import Messageable
from discord.ext import commands


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


def should_ignore_message(
    message: discord.Message,
    target_guild_ids: set[int],
    target_channel_ids: set[int],
) -> bool:
    if message.guild is None or message.guild.id not in target_guild_ids:
        return True
    if target_channel_ids and message.channel.id not in target_channel_ids:
        return True
    return bool(message.author and message.author.bot)


def stringify_message_content(message: discord.Message) -> str:
    parts: list[str] = []

    base_content = message.clean_content or message.content
    if base_content:
        parts.append(base_content)

    if message.attachments:
        attachments = ", ".join(attachment.url for attachment in message.attachments)
        parts.append(f"[attachments] {attachments}")

    if message.embeds:
        parts.append(f"[embeds] {len(message.embeds)} embed(s)")

    return " | ".join(parts) if parts else "[no text content]"


def log_entry(
    logger: logging.Logger,
    *,
    timestamp: str,
    guild_id: int,
    guild_name: str,
    category_name: str,
    channel_name: str,
    mentions_me: bool,
    author: str,
    content: str,
):
    logger.info(
        "[%s] [%s|%s] [%s / #%s] [MESSAGE]%s %s: %s",
        timestamp,
        guild_id,
        guild_name,
        category_name,
        channel_name,
        " [MENTION]" if mentions_me else "",
        author,
        content,
    )


async def send_webhook_notification(
    webhook: discord.Webhook | None,
    *,
    guild_name: str,
    channel_name: str,
    author: str,
    content: str,
):
    if webhook is None:
        return

    safe_content = content if len(content) <= 1750 else f"{content[:1747]}..."
    message = (
        f"**[{guild_name} / #{channel_name}]**\n"
        f"**{author}**\n"
        f"{safe_content}"
    )
    await webhook.send(content=message, username="SpyCord Alerts", wait=False)


def install_read_only_guards():
    async def blocked_send(*args, **kwargs):
        raise RuntimeError("SpyCord is running in read-only mode and cannot send messages.")

    async def blocked_add_reaction(*args, **kwargs):
        raise RuntimeError("SpyCord is running in read-only mode and cannot add reactions.")

    async def blocked_remove_reaction(*args, **kwargs):
        raise RuntimeError("SpyCord is running in read-only mode and cannot remove reactions.")

    async def blocked_clear_reaction(*args, **kwargs):
        raise RuntimeError("SpyCord is running in read-only mode and cannot clear reactions.")

    Messageable.send = blocked_send
    discord.Message.reply = blocked_send
    discord.Message.add_reaction = blocked_add_reaction
    discord.Message.remove_reaction = blocked_remove_reaction
    discord.Message.clear_reaction = blocked_clear_reaction
    discord.Message.clear_reactions = blocked_clear_reaction


def create_client(
    guild_ids: Iterable[int],
    channel_ids: Iterable[int],
    webhook_url: str | None,
    log_file: str | None,
) -> commands.Bot:
    logger = build_logger(log_file)
    target_guild_ids = {int(guild_id) for guild_id in guild_ids}
    target_channel_ids = {int(channel_id) for channel_id in channel_ids}
    webhook_url = (webhook_url or "").strip() or None
    install_read_only_guards()

    bot = commands.Bot(
        command_prefix="spycord-7f3b1q9zv2n4k8r6x0m5",
    )
    bot.spycord_guilds = []
    bot.spycord_webhook_session = None
    bot.spycord_webhook = None

    @bot.event
    async def on_ready():
        logger.info("Logged in as %s (%s)", bot.user, bot.user.id)
        guild_entries = []
        available_channel_ids: set[int] = set()
        for guild in bot.guilds:
            text_channels = []
            for channel in guild.text_channels:
                text_channels.append(
                    {
                        "id": channel.id,
                        "name": channel.name,
                        "category": channel.category.name if channel.category else "No Category",
                        "monitored": channel.id in target_channel_ids if target_channel_ids else True,
                    }
                )
                available_channel_ids.add(channel.id)
            guild_entries.append(
                {
                    "id": guild.id,
                    "name": guild.name,
                    "icon_url": str(guild.icon.url) if guild.icon else None,
                    "monitored": guild.id in target_guild_ids,
                    "channels": text_channels,
                }
            )
        bot.spycord_guilds = guild_entries

        if webhook_url and bot.spycord_webhook_session is None:
            bot.spycord_webhook_session = aiohttp.ClientSession()
            bot.spycord_webhook = discord.Webhook.from_url(webhook_url, session=bot.spycord_webhook_session)

        if webhook_url and target_channel_ids:
            unavailable_channels = sorted(target_channel_ids - available_channel_ids)
            if unavailable_channels:
                logger.warning(
                    "Configured channel(s) unavailable: %s",
                    ", ".join(str(channel_id) for channel_id in unavailable_channels),
                )

        found_guilds = [guild for guild in bot.guilds if guild.id in target_guild_ids]
        missing_guilds = sorted(target_guild_ids - {guild.id for guild in found_guilds})

        logger.info("Discovered %s guild(s) for this bot account.", len(bot.guilds))

        for guild in found_guilds:
            logger.info("Monitoring guild: %s (%s)", guild.name, guild.id)

        if missing_guilds:
            logger.error("Guild(s) unavailable: %s", ", ".join(str(guild_id) for guild_id in missing_guilds))

        if not target_guild_ids:
            logger.info("No guilds selected yet. SpyCord is connected and waiting for your selection.")
        elif not found_guilds:
            logger.warning("No configured guilds are currently available. SpyCord will stay connected and idle.")

    @bot.listen("on_message")
    async def on_message(message: discord.Message):
        if should_ignore_message(message, target_guild_ids, target_channel_ids):
            return

        created_at = message.created_at.isoformat()
        author = str(message.author)
        content = stringify_message_content(message)
        channel_name = getattr(message.channel, "name", str(message.channel))
        category_name = getattr(getattr(message.channel, "category", None), "name", "No Category")
        guild_name = getattr(message.guild, "name", "Unknown Guild")
        mentions_me = bool(bot.user and message.mentions and any(user.id == bot.user.id for user in message.mentions))

        log_entry(
            logger,
            timestamp=created_at,
            guild_id=message.guild.id,
            guild_name=guild_name,
            category_name=category_name,
            channel_name=channel_name,
            mentions_me=mentions_me,
            author=author,
            content=content,
        )

        try:
            await send_webhook_notification(
                bot.spycord_webhook,
                guild_name=guild_name,
                channel_name=channel_name,
                author=author,
                content=content,
            )
        except Exception as exc:
            logger.error("Failed to send webhook notification: %s", exc)

    original_close = bot.close

    async def close_with_cleanup():
        await original_close()
        if bot.spycord_webhook_session is not None:
            await bot.spycord_webhook_session.close()
            bot.spycord_webhook_session = None
        bot.spycord_webhook = None

    bot.close = close_with_cleanup

    return bot


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
        dest="guild_ids",
        type=int,
        required=True,
        action="append",
        help="Guild ID to monitor. Repeat the flag to watch multiple guilds.",
    )
    parser.add_argument(
        "-l",
        "--log-file",
        dest="log_file",
        help="Optional file path to append message logs",
    )
    parser.add_argument(
        "-c",
        "--channel-id",
        dest="channel_ids",
        type=int,
        action="append",
        default=[],
        help="Optional channel ID to monitor. Repeat to watch specific channels only.",
    )
    parser.add_argument(
        "-w",
        "--webhook-url",
        dest="webhook_url",
        help="Optional Discord webhook URL for message notifications.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    client = create_client(args.guild_ids, args.channel_ids, args.webhook_url, args.log_file)
    client.run(args.token)


if __name__ == "__main__":
    main()
