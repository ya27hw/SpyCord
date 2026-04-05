import argparse
import json
import mimetypes
import re
from collections import OrderedDict
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


LOG_PATTERN_WITH_GUILD = re.compile(
    r"^\[(?P<timestamp>.+?)\] \[(?P<guild_id>\d+)\|(?P<guild_name>.*?)\] \[(?P<category>.*?) / #(?P<channel>.*?)\](?: \[(?P<event_type>[A-Z]+)\])?(?: \[(?P<mention_flag>MENTION)\])? (?P<author>.*?): (?P<content>.*)$"
)
LOG_PATTERN_LEGACY = re.compile(
    r"^\[(?P<timestamp>.+?)\] \[(?P<category>.*?) / #(?P<channel>.*?)\](?: \[(?P<event_type>[A-Z]+)\])? (?P<author>.*?): (?P<content>.*)$"
)
STATIC_DIR = Path(__file__).with_name("viewer")


@dataclass
class MessageEntry:
    timestamp: str
    guild_id: str
    guild_name: str
    category: str
    channel: str
    event_type: str
    mentions_me: bool
    author: str
    content: str
    line_number: int

    @property
    def channel_id(self) -> str:
        return f"{self.guild_id}::{self.category}::{self.channel}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "guild_id": self.guild_id,
            "guild_name": self.guild_name,
            "category": self.category,
            "channel": self.channel,
            "channel_id": self.channel_id,
            "event_type": self.event_type,
            "mentions_me": self.mentions_me,
            "author": self.author,
            "content": self.content,
            "line_number": self.line_number,
        }


def parse_log_file(
    log_path: Path,
) -> tuple[list[MessageEntry], list[dict[str, Any]], list[dict[str, Any]], str | None, str | None]:
    messages: list[MessageEntry] = []
    channels: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
    guilds: "OrderedDict[str, dict[str, Any]]" = OrderedDict()

    if not log_path.exists():
        return messages, [], [], None, None

    with log_path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.rstrip("\n")
            match = LOG_PATTERN_WITH_GUILD.match(line)
            if match is None:
                legacy_match = LOG_PATTERN_LEGACY.match(line)
                if legacy_match is None:
                    continue
                guild_id = "legacy"
                guild_name = "Unknown Server"
                category = legacy_match.group("category")
                channel = legacy_match.group("channel")
                event_type = legacy_match.group("event_type") or "MESSAGE"
                mentions_me = False
                author = legacy_match.group("author")
                content = legacy_match.group("content")
            else:
                guild_id = match.group("guild_id")
                guild_name = match.group("guild_name")
                category = match.group("category")
                channel = match.group("channel")
                event_type = match.group("event_type") or "MESSAGE"
                mentions_me = match.group("mention_flag") == "MENTION"
                author = match.group("author")
                content = match.group("content")

            if guild_id not in guilds:
                guilds[guild_id] = {
                    "id": guild_id,
                    "name": guild_name,
                    "icon_url": None,
                }

            entry = MessageEntry(
                timestamp=(match.group("timestamp") if match else legacy_match.group("timestamp")),
                guild_id=guild_id,
                guild_name=guild_name,
                category=category,
                channel=channel,
                event_type=event_type,
                mentions_me=mentions_me,
                author=author,
                content=content,
                line_number=line_number,
            )
            messages.append(entry)

            if entry.channel_id not in channels:
                channels[entry.channel_id] = {
                    "id": entry.channel_id,
                    "guild_id": entry.guild_id,
                    "guild_name": entry.guild_name,
                    "category": entry.category,
                    "name": entry.channel,
                    "count": 0,
                    "last_timestamp": entry.timestamp,
                }

            channels[entry.channel_id]["count"] += 1
            channels[entry.channel_id]["last_timestamp"] = entry.timestamp

    selected_guild = next(iter(guilds), None)
    selected_channel = next(
        (channel["id"] for channel in channels.values() if channel["guild_id"] == selected_guild),
        None,
    )
    return messages, list(channels.values()), list(guilds.values()), selected_guild, selected_channel


def message_matches_search(message: MessageEntry, search_query: str) -> bool:
    if not search_query:
        return True

    needle = search_query.casefold()
    haystacks = (
        message.author,
        message.content,
        message.category,
        message.channel,
        message.event_type,
    )
    return any(needle in haystack.casefold() for haystack in haystacks)


def message_matches_highlights(message: MessageEntry, keywords: list[str]) -> bool:
    if message.mentions_me:
        return True

    if not keywords:
        return False

    content = message.content.casefold()
    return any(keyword in content for keyword in keywords)


def build_state(
    log_path: Path,
    selected_guild: str | None,
    selected_channel: str | None,
    limit: int,
    search_query: str,
    before_line: int | None = None,
    scope: str = "channel",
    highlight_only: bool = False,
    keywords: list[str] | None = None,
) -> dict[str, Any]:
    messages, channels, guilds, default_guild, default_channel = parse_log_file(log_path)
    active_guild = selected_guild or default_guild
    scope_mode = scope if scope in {"channel", "guild"} else "channel"
    normalized_keywords = [keyword.casefold() for keyword in (keywords or []) if keyword]

    if active_guild:
        guild_channels = [channel for channel in channels if channel["guild_id"] == active_guild]
        if scope_mode == "guild":
            active_channel = None
        elif selected_channel and any(channel["id"] == selected_channel for channel in guild_channels):
            active_channel = selected_channel
        else:
            active_channel = guild_channels[0]["id"] if guild_channels else None
    else:
        guild_channels = channels
        active_channel = None if scope_mode == "guild" else (selected_channel or default_channel)

    if active_channel:
        filtered = [message for message in messages if message.channel_id == active_channel]
    elif active_guild:
        filtered = [message for message in messages if message.guild_id == active_guild]
    else:
        filtered = messages

    if highlight_only:
        filtered = [
            message for message in filtered if message_matches_highlights(message, normalized_keywords)
        ]
    filtered = [message for message in filtered if message_matches_search(message, search_query)]
    if before_line is not None:
        filtered = [message for message in filtered if message.line_number < before_line]

    has_more_older = len(filtered) > limit
    filtered = filtered[-limit:]
    last_updated = log_path.stat().st_mtime if log_path.exists() else None

    return {
        "log_path": str(log_path),
        "guilds": guilds,
        "channels": channels,
        "selected_guild": active_guild,
        "selected_channel": active_channel,
        "search_query": search_query,
        "messages": [message.to_dict() for message in filtered],
        "has_more_older": has_more_older,
        "oldest_line": filtered[0].line_number if filtered else None,
        "newest_line": filtered[-1].line_number if filtered else None,
        "last_updated": last_updated,
        "available": log_path.exists(),
    }


def load_text_file(path: Path) -> bytes:
    return path.read_bytes()


class LogViewerHandler(BaseHTTPRequestHandler):
    log_path: Path
    message_limit: int

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/state":
            self.handle_state_api(parsed.query)
            return

        self.handle_static(parsed.path)

    def handle_state_api(self, query: str):
        params = parse_qs(query)
        selected_guild = params.get("guild", [None])[0]
        selected_channel = params.get("channel", [None])[0]
        search_query = params.get("q", [""])[0]
        highlight_only = params.get("highlight_only", ["0"])[0] == "1"
        keywords = [value.strip() for value in params.get("keyword", []) if value.strip()]
        raw_limit = params.get("limit", [str(self.message_limit)])[0]
        try:
            requested_limit = int(raw_limit)
        except ValueError:
            requested_limit = self.message_limit
        requested_limit = max(1, min(requested_limit, self.message_limit))

        raw_before_line = params.get("before_line", [None])[0]
        try:
            before_line = int(raw_before_line) if raw_before_line is not None else None
        except ValueError:
            before_line = None

        state = build_state(
            self.log_path,
            selected_guild,
            selected_channel,
            requested_limit,
            search_query,
            before_line,
            highlight_only=highlight_only,
            keywords=keywords,
        )
        payload = json.dumps(state).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def handle_static(self, request_path: str):
        relative_path = "index.html" if request_path in {"", "/"} else request_path.lstrip("/")
        file_path = (STATIC_DIR / relative_path).resolve()

        if not str(file_path).startswith(str(STATIC_DIR.resolve())) or not file_path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        payload = load_text_file(file_path)
        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type or 'application/octet-stream'}; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args):
        return


def create_handler(log_path: Path, message_limit: int):
    class BoundHandler(LogViewerHandler):
        pass

    BoundHandler.log_path = log_path
    BoundHandler.message_limit = message_limit
    return BoundHandler


def create_server(host: str, port: int, log_path: Path, message_limit: int) -> ThreadingHTTPServer:
    handler = create_handler(log_path, message_limit)
    return ThreadingHTTPServer((host, port), handler)


def parse_args():
    parser = argparse.ArgumentParser(description="Serve a live viewer for Discord monitor logs.")
    parser.add_argument(
        "-l",
        "--log-file",
        default="logs/messages.log",
        help="Path to the monitor log file",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument(
        "--limit",
        type=int,
        default=250,
        help="Maximum number of messages to return for the selected channel",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    log_path = Path(args.log_file).resolve()
    server = create_server(args.host, args.port, log_path, args.limit)
    print(f"Serving log viewer at http://{args.host}:{args.port}")
    print(f"Reading log file: {log_path}")
    server.serve_forever()



if __name__ == "__main__":
    main()
