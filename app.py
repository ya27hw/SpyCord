import argparse
import asyncio
import json
import threading
from http import HTTPStatus
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from log_viewer import STATIC_DIR, build_state, load_text_file
from monitor import create_client


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run the Discord guild monitor and live log viewer together."
    )
    parser.add_argument("-t", "--token", help="Discord bot token")
    parser.add_argument(
        "-g",
        "--guild-id",
        dest="guild_ids",
        type=int,
        action="append",
        help="Guild ID to monitor. Repeat the flag to watch multiple guilds.",
    )
    parser.add_argument(
        "-l",
        "--log-file",
        default="logs/messages.log",
        help="Path to the shared log file",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface for the web viewer")
    parser.add_argument("--port", type=int, default=8765, help="Port for the web viewer")
    parser.add_argument(
        "--limit",
        type=int,
        default=250,
        help="Maximum number of messages shown in the selected channel",
    )
    parser.add_argument(
        "--config-file",
        default="spycord_config.json",
        help="Path to the local SpyCord config file",
    )
    parser.add_argument(
        "-c",
        "--channel-id",
        dest="channel_ids",
        type=int,
        action="append",
        help="Channel ID to monitor. Repeat the flag to watch multiple channels.",
    )
    parser.add_argument(
        "-w",
        "--webhook-url",
        default=None,
        help="Optional Discord webhook URL for channel notifications.",
    )
    return parser.parse_args()


def parse_guild_ids(raw_value: str) -> list[int]:
    tokens = [token.strip() for token in raw_value.replace("\n", ",").split(",")]
    guild_ids: list[int] = []
    for token in tokens:
        if not token:
            continue
        guild_ids.append(int(token))
    return guild_ids


class MonitorManager:
    def __init__(self, log_path: Path):
        self.log_path = log_path
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._client = None
        self._running = False
        self._error: str | None = None
        self._guild_ids: list[int] = []
        self._channel_ids: list[int] = []
        self._token: str | None = None
        self._webhook_url: str = ""
        self._webhook_enabled: bool = False
        self._startup_event: threading.Event | None = None

    def status(self) -> dict[str, Any]:
        with self._lock:
            client = self._client
            guilds: list[dict[str, Any]] = []
            if client is not None:
                for guild in getattr(client, "spycord_guilds", []):
                    guilds.append(
                        {
                            "id": str(guild.get("id", "")),
                            "name": guild.get("name", "Unknown Server"),
                            "icon_url": guild.get("icon_url"),
                            "monitored": bool(guild.get("monitored")),
                            "channels": [
                                {
                                    "id": str(channel.get("id", "")),
                                    "name": channel.get("name", "unknown-channel"),
                                    "category": channel.get("category", "No Category"),
                                    "monitored": bool(channel.get("monitored")),
                                }
                                for channel in guild.get("channels", [])
                            ],
                        }
                    )
            return {
                "running": self._running,
                "error": self._error,
                "guild_ids": [str(guild_id) for guild_id in self._guild_ids],
                "channel_ids": [str(channel_id) for channel_id in self._channel_ids],
                "webhook_configured": bool(self._webhook_url),
                "webhook_enabled": self._webhook_enabled,
                "guilds": guilds,
            }

    def start(
        self,
        token: str,
        guild_ids: list[int],
        channel_ids: list[int] | None = None,
        webhook_url: str | None = None,
        webhook_enabled: bool = False,
    ):
        normalized_guild_ids = list(guild_ids)
        normalized_channel_ids = list(channel_ids or [])
        normalized_webhook_url = (webhook_url or "").strip()
        normalized_webhook_enabled = bool(webhook_enabled)
        with self._lock:
            if (
                self._running
                and self._token == token
                and self._guild_ids == normalized_guild_ids
                and self._channel_ids == normalized_channel_ids
                and self._webhook_url == normalized_webhook_url
                and self._webhook_enabled == normalized_webhook_enabled
            ):
                return

        self.stop()
        startup_event = threading.Event()

        with self._lock:
            self._error = None
            self._guild_ids = normalized_guild_ids
            self._channel_ids = normalized_channel_ids
            self._token = token
            self._webhook_url = normalized_webhook_url
            self._webhook_enabled = normalized_webhook_enabled
            self._startup_event = startup_event

        thread = threading.Thread(
            target=self._run_client,
            args=(
                token,
                normalized_guild_ids,
                normalized_channel_ids,
                normalized_webhook_url,
                normalized_webhook_enabled,
                startup_event,
            ),
            daemon=True,
        )
        with self._lock:
            self._thread = thread
        thread.start()
        startup_event.wait(timeout=10)

    def _run_client(
        self,
        token: str,
        guild_ids: list[int],
        channel_ids: list[int],
        webhook_url: str,
        webhook_enabled: bool,
        startup_event: threading.Event,
    ):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        client = create_client(guild_ids, channel_ids, webhook_url, webhook_enabled, str(self.log_path))

        with self._lock:
            self._loop = loop
            self._client = client
            self._running = True
            startup_event.set()

        try:
            loop.run_until_complete(client.start(token))
        except Exception as exc:
            with self._lock:
                self._error = str(exc)
        finally:
            with self._lock:
                self._running = False
                self._client = None
                self._loop = None
                if self._startup_event is startup_event:
                    self._startup_event = None
            loop.close()

    def stop(self):
        with self._lock:
            loop = self._loop
            client = self._client
            thread = self._thread
            startup_event = self._startup_event

        if loop is not None and client is not None:
            future = asyncio.run_coroutine_threadsafe(client.close(), loop)
            try:
                future.result(timeout=10)
            except Exception:
                pass
        elif startup_event is not None:
            startup_event.wait(timeout=10)
            with self._lock:
                loop = self._loop
                client = self._client
                thread = self._thread
            if loop is not None and client is not None:
                future = asyncio.run_coroutine_threadsafe(client.close(), loop)
                try:
                    future.result(timeout=10)
                except Exception:
                    pass

        if thread is not None and thread.is_alive():
            thread.join(timeout=10)

        with self._lock:
            self._thread = None
            self._client = None
            self._loop = None
            self._running = False
            self._token = None
            self._webhook_url = ""
            self._webhook_enabled = False
            self._startup_event = None


def load_config(config_path: Path) -> dict[str, Any]:
    if not config_path.exists():
        return {
            "token": "",
            "guild_ids": [],
            "channel_ids": [],
            "webhook_url": "",
            "webhook_enabled": False,
            "keywords": [],
        }

    with config_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    return {
        "token": data.get("token", ""),
        "guild_ids": [int(guild_id) for guild_id in data.get("guild_ids", [])],
        "channel_ids": [int(channel_id) for channel_id in data.get("channel_ids", [])],
        "webhook_url": str(data.get("webhook_url", "")).strip(),
        "webhook_enabled": bool(data.get("webhook_enabled", False)),
        "keywords": [str(keyword).strip() for keyword in data.get("keywords", []) if str(keyword).strip()],
    }


def serialize_config(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "token": config.get("token", ""),
        "guild_ids": [str(guild_id) for guild_id in config.get("guild_ids", [])],
        "channel_ids": [str(channel_id) for channel_id in config.get("channel_ids", [])],
        "webhook_url": config.get("webhook_url", ""),
        "webhook_enabled": bool(config.get("webhook_enabled", False)),
        "keywords": [str(keyword) for keyword in config.get("keywords", []) if str(keyword).strip()],
    }


def save_config(config_path: Path, config: dict[str, Any]):
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with config_path.open("w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)


def create_app_server(
    host: str,
    port: int,
    *,
    log_path: Path,
    config_path: Path,
    message_limit: int,
    manager: MonitorManager,
):
    from http.server import BaseHTTPRequestHandler
    import mimetypes

    class AppHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/api/state":
                self.handle_state_api(parsed.query)
                return
            if parsed.path == "/api/config":
                self.handle_config_get()
                return
            self.handle_static(parsed.path)

        def do_POST(self):
            parsed = urlparse(self.path)
            if parsed.path == "/api/config":
                self.handle_config_post()
                return
            if parsed.path == "/api/monitor/stop":
                manager.stop()
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "config": serialize_config(load_config(config_path)),
                        "monitor": manager.status(),
                    },
                )
                return
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")

        def handle_state_api(self, query: str):
            params = parse_qs(query)
            selected_guild = params.get("guild", [None])[0]
            selected_channel = params.get("channel", [None])[0]
            search_query = params.get("q", [""])[0]
            raw_limit = params.get("limit", [str(message_limit)])[0]
            try:
                requested_limit = int(raw_limit)
            except ValueError:
                requested_limit = message_limit
            requested_limit = max(1, min(requested_limit, message_limit))

            raw_before_line = params.get("before_line", [None])[0]
            try:
                before_line = int(raw_before_line) if raw_before_line is not None else None
            except ValueError:
                before_line = None

            payload = build_state(
                log_path,
                selected_guild,
                selected_channel,
                requested_limit,
                search_query,
                before_line,
            )
            payload["monitor"] = manager.status()
            self.send_json(HTTPStatus.OK, payload)

        def handle_config_get(self):
            self.send_json(
                HTTPStatus.OK,
                {
                    "config": serialize_config(load_config(config_path)),
                    "monitor": manager.status(),
                },
            )

        def handle_config_post(self):
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            data = json.loads(raw_body.decode("utf-8"))

            token = str(data.get("token", "")).strip()
            guild_ids_raw = data.get("guild_ids", [])
            guild_ids = [int(guild_id) for guild_id in guild_ids_raw if str(guild_id).strip()]
            channel_ids_raw = data.get("channel_ids", [])
            channel_ids = [int(channel_id) for channel_id in channel_ids_raw if str(channel_id).strip()]
            webhook_url = str(data.get("webhook_url", "")).strip()
            webhook_enabled = bool(data.get("webhook_enabled", False))
            keywords_raw = data.get("keywords", [])
            keywords = [str(keyword).strip() for keyword in keywords_raw if str(keyword).strip()]
            config = {
                "token": token,
                "guild_ids": guild_ids,
                "channel_ids": channel_ids,
                "webhook_url": webhook_url,
                "webhook_enabled": webhook_enabled,
                "keywords": keywords,
            }
            save_config(config_path, config)

            if data.get("start_monitor", True) and token:
                manager.start(token, guild_ids, channel_ids, webhook_url, webhook_enabled)

            self.send_json(
                HTTPStatus.OK,
                {
                    "config": serialize_config(config),
                    "monitor": manager.status(),
                },
            )

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

        def send_json(self, status: HTTPStatus, payload: dict[str, Any]):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args):
            return

    return ThreadingHTTPServer((host, port), AppHandler)


def main():
    args = parse_args()
    log_path = Path(args.log_file).resolve()
    config_path = Path(args.config_file).resolve()
    manager = MonitorManager(log_path)
    initial_config = load_config(config_path)

    if args.token is not None or args.guild_ids or args.channel_ids or args.webhook_url is not None:
        initial_config = {
            "token": args.token or initial_config.get("token", ""),
            "guild_ids": args.guild_ids or initial_config.get("guild_ids", []),
            "channel_ids": args.channel_ids or initial_config.get("channel_ids", []),
            "webhook_url": args.webhook_url if args.webhook_url is not None else initial_config.get("webhook_url", ""),
            "webhook_enabled": bool(initial_config.get("webhook_enabled", False)),
            "keywords": list(initial_config.get("keywords", [])),
        }
        save_config(config_path, initial_config)

    if initial_config.get("token"):
        manager.start(
            initial_config["token"],
            initial_config.get("guild_ids", []),
            initial_config.get("channel_ids", []),
            initial_config.get("webhook_url", ""),
            bool(initial_config.get("webhook_enabled", False)),
        )

    server = create_app_server(
        args.host,
        args.port,
        log_path=log_path,
        config_path=config_path,
        message_limit=args.limit,
        manager=manager,
    )
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    print(f"Viewer running at http://{args.host}:{args.port}")
    print(f"Writing and reading logs from: {log_path}")
    print(f"Using config file: {config_path}")
    print("Press Ctrl+C to stop SpyCord.")

    try:
        while server_thread.is_alive():
            server_thread.join(timeout=1)
    except KeyboardInterrupt:
        print("\nStopping SpyCord...")
    finally:
        manager.stop()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
