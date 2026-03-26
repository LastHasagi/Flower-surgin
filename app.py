"""
Servidor Flask para servir o site estático (deploy na Railway e desenvolvimento local).

Respostas incluem o header Bypass-Tunnel-Reminder (localtunnel / loca.lt). O lembrete
do túnel é decidido no edge; para o primeiro GET no browser, em muitos casos ainda
é preciso extensão (ex.: ModHeader) ou um pedido com esse header (ex.: fetch no consola).
"""
import os

from flask import Flask, abort, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)


@app.after_request
def _localtunnel_bypass_reminder(response):
    response.headers.setdefault("Bypass-Tunnel-Reminder", "true")
    return response


def _safe_name(filename: str) -> bool:
    if not filename or filename.startswith(".") or "/." in filename.replace("\\", "/"):
        return False
    parts = filename.replace("\\", "/").split("/")
    if ".." in parts or any(p.startswith(".") for p in parts if p):
        return False
    return True


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    if not _safe_name(filename):
        abort(404)
    return send_from_directory(BASE_DIR, filename)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
