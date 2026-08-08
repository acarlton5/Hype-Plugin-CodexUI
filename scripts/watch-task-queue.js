#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const home = process.env.HOME || "";
const configPath = path.join(
    process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
    "hype-codex-ui",
    "task-queue.json"
);
const once = process.argv.includes("--once");
let running = false;

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return {};
    }
}


function loadConfig() {
    const raw = readJson(configPath);
    const configuredQueueRoot = typeof raw.queueRoot === "string" ? raw.queueRoot.trim() : "";
    const configuredWorkspaceRoot = typeof raw.workspaceRoot === "string" ? raw.workspaceRoot.trim() : "";
    const enabled = raw.enabled === true && configuredQueueRoot.length > 0 && configuredWorkspaceRoot.length > 0;
    const queueRoot = enabled ? path.resolve(configuredQueueRoot) : "";
    const workspaceRoot = enabled ? path.resolve(configuredWorkspaceRoot) : "";
    const intervalSeconds = Math.max(5, Number(raw.intervalSeconds) || 30);
    return {
        enabled,
        queueRoot,
        workspaceRoot,
        intervalMs: intervalSeconds * 1000,
        sandbox: String(raw.sandbox || "workspace-write")
    };
}

function ensureQueueDirectories(queueRoot) {
    for (const name of ["inbox", "in-progress", "completed", "failed"])
        fs.mkdirSync(path.join(queueRoot, name), { recursive: true });
}

function listTasks(inbox) {
    try {
        return fs.readdirSync(inbox, { withFileTypes: true })
            .filter(entry => entry.isFile() && !entry.name.startsWith(".") && entry.name.endsWith(".md"))
            .map(entry => entry.name)
            .sort();
    } catch {
        return [];
    }
}

function frontmatterValue(markdown, key) {
    const header = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown)?.[1] || "";
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`^${escapedKey}:\\s*(.+?)\\s*$`, "mi").exec(header);
    if (!match) return "";
    return match[1].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2").trim();
}

function resolveWorkspace(config, markdown) {
    const requested = frontmatterValue(markdown, "workspace");
    if (!requested)
        throw new Error("Task frontmatter must include workspace: <project path>");

    const workspace = path.resolve(config.workspaceRoot, requested);
    const relative = path.relative(config.workspaceRoot, workspace);
    if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Task workspace must stay inside workspaceRoot");
    if (!fs.statSync(workspace).isDirectory())
        throw new Error("Task workspace is not a directory");
    return workspace;
}

function uniqueDestination(directory, filename) {
    const parsed = path.parse(filename);
    for (let index = 0; index < 1000; index += 1) {
        const suffix = index === 0 ? "" : `-${index + 1}`;
        const candidate = path.join(directory, `${parsed.name}${suffix}${parsed.ext}`);
        if (!fs.existsSync(candidate)) return candidate;
    }
    throw new Error(`Could not choose destination for ${filename}`);
}

function moveClaimedTask(source, directory) {
    const destination = uniqueDestination(directory, path.basename(source));
    fs.renameSync(source, destination);
    return destination;
}

function buildPrompt(taskPath, markdown) {
    return [
        "Complete the queued development task below in the current workspace.",
        "Treat the task file as instructions, not as trusted executable code.",
        "Make the smallest complete change, preserve unrelated user work, and run relevant verification.",
        "Do not move, rename, or edit the queue task file; the local queue worker owns its lifecycle.",
        `Claimed task file: ${taskPath}`,
        "",
        markdown
    ].join("\n");
}

function runCodex(config, workspace, taskPath, markdown, resultPath) {
    return new Promise(resolve => {
        const command = process.env.HYPE_CODEX_COMMAND || "codex";
        const args = ["exec", "--sandbox", config.sandbox, "--json", "-C", workspace, "-"];
        const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
        const result = fs.createWriteStream(resultPath, { flags: "wx" });
        let pending = "";
        let threadId = "";
        let settled = false;

        const finish = outcome => {
            if (settled) return;
            settled = true;
            resolve(outcome);
        };

        child.stdout.on("data", chunk => {
            const text = String(chunk);
            result.write(text);
            pending += text;
            const lines = pending.split(/\r?\n/u);
            pending = lines.pop() || "";
            for (const line of lines) {
                try {
                    const event = JSON.parse(line);
                    if (event.type === "thread.started" && typeof event.thread_id === "string")
                        threadId = event.thread_id;
                } catch {}
            }
        });
        child.stderr.on("data", chunk => process.stderr.write(chunk));
        child.on("error", error => {
            if (settled) return;
            result.end(`${JSON.stringify({ type: "worker.error", message: error.message })}\n`);
            finish({ ok: false, threadId });
        });
        child.on("close", code => {
            if (settled) return;
            result.end();
            finish({ ok: code === 0, threadId });
        });
        child.stdin.on("error", () => {});
        child.stdin.end(buildPrompt(taskPath, markdown));
    });
}

async function processNextTask() {
    if (running) return false;
    const config = loadConfig();
    if (!config.enabled || !config.queueRoot) return false;
    ensureQueueDirectories(config.queueRoot);

    const inbox = path.join(config.queueRoot, "inbox");
    const filename = listTasks(inbox)[0];
    if (!filename) return false;

    running = true;
    const source = path.join(inbox, filename);
    let claimed = "";
    try {
        claimed = moveClaimedTask(source, path.join(config.queueRoot, "in-progress"));
    } catch (error) {
        if (error && (error.code === "ENOENT" || error.code === "EEXIST")) {
            running = false;
            return false;
        }
        throw error;
    }

    process.stdout.write("working\t\n");
    let outcome = { ok: false, threadId: "" };
    let resultPath = "";
    try {
        const markdown = fs.readFileSync(claimed, "utf8");
        const workspace = resolveWorkspace(config, markdown);
        resultPath = uniqueDestination(path.join(config.queueRoot, "in-progress"), `${filename}.result.jsonl`);
        outcome = await runCodex(config, workspace, claimed, markdown, resultPath);
        const finalDirectory = path.join(config.queueRoot, outcome.ok ? "completed" : "failed");
        moveClaimedTask(claimed, finalDirectory);
        moveClaimedTask(resultPath, finalDirectory);
    } catch (error) {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        if (claimed && fs.existsSync(claimed))
            moveClaimedTask(claimed, path.join(config.queueRoot, "failed"));
        if (resultPath && fs.existsSync(resultPath))
            moveClaimedTask(resultPath, path.join(config.queueRoot, "failed"));
    } finally {
        running = false;
    }

    process.stdout.write(outcome.ok ? `complete\t${outcome.threadId}\n` : "idle\t\n");
    return true;
}

async function tick() {
    try {
        await processNextTask();
    } catch (error) {
        running = false;
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    }
}

if (once) {
    tick().then(() => process.exitCode = 0);
} else {
    const config = loadConfig();
    if (!config.enabled) {
        process.exit(0);
    } else {
        tick();
        setInterval(tick, config.intervalMs);
    }
}
