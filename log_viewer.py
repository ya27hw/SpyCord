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


LOG_PATTERN = re.compile(
    r"^\[(?P<timestamp>.+?)\] \[(?P<category>.*?) / #(?P<channel>.*?)\](?: \[(?P<event_type>[A-Z]+)\])? (?P<author>.*?): (?P<content>.*)$"
)
STATIC_DIR = Path(__file__).with_name("viewer")


@dataclass
class MessageEntry:
    timestamp: str
    category: str
    channel: str
    event_type: str
    author: str
    content: str
    line_number: int

    @property
    def channel_id(self) -> str:
        return f"{self.category}::{self.channel}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "category": self.category,
            "channel": self.channel,
            "channel_id": self.channel_id,
            "event_type": self.event_type,
            "author": self.author,
            "content": self.content,
            "line_number": self.line_number,
        }


def parse_log_file(log_path: Path) -> tuple[list[MessageEntry], list[dict[str, Any]], str | None]:
    messages: list[MessageEntry] = []
    channels: "OrderedDict[str, dict[str, Any]]" = OrderedDict()

    if not log_path.exists():
        return messages, [], None

    with log_path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.rstrip("\n")
            match = LOG_PATTERN.match(line)
            if not match:
                continue

            entry = MessageEntry(
                timestamp=match.group("timestamp"),
                category=match.group("category"),
                channel=match.group("channel"),
                event_type=match.group("event_type") or "MESSAGE",
                author=match.group("author"),
                content=match.group("content"),
                line_number=line_number,
            )
            messages.append(entry)

            if entry.channel_id not in channels:
                channels[entry.channel_id] = {
                    "id": entry.channel_id,
                    "category": entry.category,
                    "name": entry.channel,
                    "count": 0,
                    "last_timestamp": entry.timestamp,
                }

            channels[entry.channel_id]["count"] += 1
            channels[entry.channel_id]["last_timestamp"] = entry.timestamp

    selected_channel = next(iter(channels), None)
    return messages, list(channels.values()), selected_channel


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


def build_state(log_path: Path, selected_channel: str | None, limit: int, search_query: str) -> dict[str, Any]:
    messages, channels, default_channel = parse_log_file(log_path)
    active_channel = selected_channel or default_channel

    if active_channel:
        filtered = [message for message in messages if message.channel_id == active_channel]
    else:
        filtered = messages

    filtered = [message for message in filtered if message_matches_search(message, search_query)]
    filtered = filtered[-limit:]
    last_updated = log_path.stat().st_mtime if log_path.exists() else None

    return {
        "log_path": str(log_path),
        "channels": channels,
        "selected_channel": active_channel,
        "search_query": search_query,
        "messages": [message.to_dict() for message in filtered],
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
        selected_channel = params.get("channel", [None])[0]
        search_query = params.get("q", [""])[0]
        state = build_state(self.log_path, selected_channel, self.message_limit, search_query)
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
