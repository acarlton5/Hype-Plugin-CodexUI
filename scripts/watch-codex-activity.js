#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const home = process.env.HOME || "";
const roots = [
    path.join(process.env.XDG_DATA_HOME || path.join(home, ".local/share"), "hype-codex-ui"),
    path.join(process.env.XDG_DATA_HOME || path.join(home, ".local/share"), "codex-ui")
];

let WebSocketImpl = null;
let retryTimer = null;
let completionTimer = null;
let lastState = "";
let lastThread = "";
const activeTurns = new Set();

function emit(state, thread = "") {
    if (state === lastState && thread === lastThread)
        return;
    lastState = state;
    lastThread = thread;
    process.stdout.write(`${state}\t${thread}\n`);
}

function turnId(params = {}) {
    const turn = params && typeof params.turn === "object" ? params.turn : {};
    return String(turn.id || params.turnId || params.turn_id || "");
}

function threadId(params = {}) {
    const turn = params && typeof params.turn === "object" ? params.turn : {};
    return String(params.threadId || params.thread_id || turn.threadId || turn.thread_id || "");
}

function findWebSocket() {
    for (const root of roots) {
        const candidate = path.join(root, "node_modules/ws");
        if (fs.existsSync(candidate)) {
            try {
                return require(candidate);
            } catch {}
        }
    }
    return null;
}

function markWorking(params) {
    const id = turnId(params);
    if (id)
        activeTurns.add(id);
    clearTimeout(completionTimer);
    emit("working", threadId(params));
}

function handleEvent(event) {
    const method = String(event && event.method || "");
    const params = event && event.params || {};

    if (method === "turn/started") {
        markWorking(params);
        return;
    }

    if (method === "turn/completed") {
        const id = turnId(params);
        if (id)
            activeTurns.delete(id);
        if (activeTurns.size > 0) {
            emit("working", threadId(params));
            return;
        }
        emit("complete", threadId(params));
        clearTimeout(completionTimer);
        completionTimer = setTimeout(() => emit("idle"), 8000);
        return;
    }

    // A watcher may connect after turn/started. Ongoing item and token-usage
    // events still identify the active turn, so use them to recover state.
    if ((method.startsWith("item/") || method === "thread/tokenUsage/updated") && turnId(params))
        markWorking(params);
}

function connect() {
    WebSocketImpl = WebSocketImpl || findWebSocket();
    if (!WebSocketImpl) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, 2000);
        return;
    }

    let socket;
    try {
        socket = new WebSocketImpl("ws://127.0.0.1:5900/codex-api/ws");
    } catch {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, 2000);
        return;
    }

    socket.on("message", data => {
        try {
            handleEvent(JSON.parse(String(data)));
        } catch {}
    });
    socket.on("close", () => {
        activeTurns.clear();
        clearTimeout(completionTimer);
        emit("idle");
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, 2000);
    });
    socket.on("error", () => socket.close());
}

emit("idle");
connect();
