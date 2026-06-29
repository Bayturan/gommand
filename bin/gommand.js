#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const VERSION = '0.1.2';
const CONFIG_DIR = process.env.GOMMAND_DIR ?? join(homedir(), '.gommand');
const CONFIG_FILE = join(CONFIG_DIR, 'commands.json');

function load() {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function persist(commands) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(commands, null, 2) + '\n');
}

function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : resolve(p);
}

// Separate -- passthrough args before any flag parsing
const allArgs = process.argv.slice(2);
const dashDashIdx = allArgs.indexOf('--');
const rawArgs = dashDashIdx !== -1 ? allArgs.slice(0, dashDashIdx) : allArgs;
const extraArgs = dashDashIdx !== -1 ? allArgs.slice(dashDashIdx + 1) : [];

// Parse global flags: --path, --save, --help, --version
let saveFlag = false;
let pathFlag = null;
let pathFlagSet = false;
const positional = [];

for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--save') {
    saveFlag = true;
  } else if ((a === '--path' || a === '-p') && i + 1 < rawArgs.length) {
    pathFlag = rawArgs[++i];
    pathFlagSet = true;
  } else if (a === '--help' || a === '-h') {
    printHelp();
    process.exit(0);
  } else if (a === '--version' || a === '-V') {
    console.log(VERSION);
    process.exit(0);
  } else {
    positional.push(a);
  }
}

if (positional.length === 0 && !saveFlag) {
  printHelp();
  process.exit(0);
}

const workDir = pathFlagSet ? expandHome(pathFlag) : process.cwd();

if (saveFlag) {
  cmdAdd(positional, workDir);
} else {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'add':
    case 'save':
      cmdAdd(rest, workDir);
      break;
    case 'list':
    case 'ls':
      cmdList();
      break;
    case 'show':
    case 'info':
      cmdShow(rest.join(' '));
      break;
    case 'remove':
    case 'rm':
    case 'del':
      cmdRemove(rest);
      break;
    case 'rename':
    case 'mv':
      cmdRename(rest);
      break;
    case 'edit':
    case 'update':
      cmdEdit(rest, pathFlagSet ? workDir : null);
      break;
    case 'test':
    case 'check':
      cmdTest(rest.join(' '));
      break;
    default:
      cmdRun(positional.join(' '), extraArgs);
  }
}

// ─── add ─────────────────────────────────────────────────────────────────────
// gommand add <cmd> as <name>
// gommand add <cmd> -n <name>
// gommand add <cmd>                 (name defaults to cmd)
function cmdAdd(args, dir) {
  let nameFlag = null;
  const remaining = [];

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-n' || args[i] === '--name') && i + 1 < args.length) {
      nameFlag = args[++i];
    } else {
      remaining.push(args[i]);
    }
  }

  let command, name;
  if (nameFlag !== null) {
    command = remaining.join(' ').trim();
    name = nameFlag;
  } else {
    const asIdx = remaining.indexOf('as');
    if (asIdx !== -1) {
      command = remaining.slice(0, asIdx).join(' ').trim();
      name = remaining.slice(asIdx + 1).join(' ').trim();
    } else {
      command = remaining.join(' ').trim();
      name = command;
    }
  }

  if (!command) {
    die('no command provided', 'gommand add <command> as <name>');
  }

  const commands = load();
  const existed = name in commands;
  commands[name] = { path: dir, command };
  persist(commands);
  console.log(`${existed ? 'Updated' : 'Saved'}: "${name}" → \`${command}\` in ${dir}`);
}

// ─── run ─────────────────────────────────────────────────────────────────────
// gommand <name> [-- extra args appended to the command]
function cmdRun(name, extra = []) {
  const commands = load();
  const entry = commands[name];
  if (!entry) {
    console.error(`gommand: unknown command "${name}"`);
    console.error('Run "gommand list" to see saved commands.');
    process.exit(1);
  }
  if (!existsSync(entry.path)) {
    console.error(`gommand: path no longer exists: ${entry.path}`);
    process.exit(1);
  }
  const fullCmd = extra.length ? `${entry.command} ${extra.join(' ')}` : entry.command;
  const result = spawnSync(fullCmd, { cwd: entry.path, shell: true, stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

// ─── list ────────────────────────────────────────────────────────────────────
function cmdList() {
  const commands = load();
  const entries = Object.entries(commands);
  if (entries.length === 0) {
    console.log('No commands saved. Use:\n  gommand add <command> as <name>');
    return;
  }
  const maxLen = Math.max(...entries.map(([n]) => n.length));
  console.log('');
  entries.forEach(([name, { path, command }], i) => {
    const idx = String(i + 1).padStart(2);
    console.log(`  ${idx}.  ${name.padEnd(maxLen)}  →  ${command}  (${path})`);
  });
  console.log('');
}

// ─── show ────────────────────────────────────────────────────────────────────
function cmdShow(name) {
  if (!name) die('no name provided', 'gommand show <name>');
  const commands = load();
  const entry = commands[name];
  if (!entry) die(`no command named "${name}"`);
  console.log('');
  console.log(`  Name:    ${name}`);
  console.log(`  Command: ${entry.command}`);
  console.log(`  Path:    ${entry.path}`);
  const exists = existsSync(entry.path);
  console.log(`  Status:  ${exists ? 'path ok' : 'WARNING: path does not exist'}`);
  console.log('');
}

// ─── test ────────────────────────────────────────────────────────────────────
// gommand test <name>  — dry-run: validate path and show what would run
function cmdTest(name) {
  if (!name) die('no name provided', 'gommand test <name>');
  const commands = load();
  const entry = commands[name];
  if (!entry) die(`no command named "${name}"`);

  const pathOk = existsSync(entry.path);
  console.log('');
  console.log(`  Name:    ${name}`);
  console.log(`  Command: ${entry.command}`);
  console.log(`  Path:    ${entry.path}`);
  console.log(`  Status:  ${pathOk ? 'OK' : 'FAIL — path does not exist'}`);
  console.log('');
  if (!pathOk) process.exit(1);
}

// ─── rename ──────────────────────────────────────────────────────────────────
// gommand rename "old name" "new name"
// gommand rename old name to new name    (uses 'to' as separator)
function cmdRename(args) {
  if (args.length === 0) die('no names provided', 'gommand rename <old> to <new>');

  let oldName, newName;
  const toIdx = args.indexOf('to');

  if (toIdx !== -1) {
    oldName = args.slice(0, toIdx).join(' ').trim();
    newName = args.slice(toIdx + 1).join(' ').trim();
  } else if (args.length === 2) {
    [oldName, newName] = args;
  } else {
    die('use "to" as separator for multi-word names', 'gommand rename "old name" to "new name"');
  }

  if (!oldName || !newName) die('both old and new names are required');

  const commands = load();
  if (!(oldName in commands)) die(`no command named "${oldName}"`);
  if (newName in commands) die(`"${newName}" already exists — remove it first`);

  commands[newName] = commands[oldName];
  delete commands[oldName];
  persist(commands);
  console.log(`Renamed: "${oldName}" → "${newName}"`);
}

// ─── edit ────────────────────────────────────────────────────────────────────
// gommand edit <name> [--cmd <new-command>]
// gommand --path <dir> edit <name>             (updates path via global flag)
// gommand --path <dir> edit <name> --cmd <cmd> (updates both)
function cmdEdit(args, newPath) {
  let cmdFlag = null;
  const remaining = [];

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--cmd' || args[i] === '-c') && i + 1 < args.length) {
      cmdFlag = args[++i];
    } else {
      remaining.push(args[i]);
    }
  }

  const name = remaining.join(' ').trim();
  if (!name) die('no name provided', 'gommand edit <name> [--cmd <command>] [--path <dir>]');
  if (!cmdFlag && !newPath) die('nothing to update — provide --cmd and/or --path');

  const commands = load();
  if (!(name in commands)) die(`no command named "${name}"`);

  if (cmdFlag) commands[name].command = cmdFlag;
  if (newPath) commands[name].path = newPath;
  persist(commands);

  const parts = [];
  if (cmdFlag) parts.push(`command → \`${cmdFlag}\``);
  if (newPath) parts.push(`path → ${newPath}`);
  console.log(`Updated "${name}": ${parts.join(', ')}`);
}

// ─── remove ──────────────────────────────────────────────────────────────────
// gommand remove <name>
// gommand remove --all
function cmdRemove(args) {
  if (args.length === 0) die('no name provided', 'gommand remove <name>  |  gommand remove --all');

  if (args[0] === '--all') {
    const commands = load();
    const count = Object.keys(commands).length;
    if (count === 0) { console.log('Nothing to remove.'); return; }
    persist({});
    console.log(`Removed all ${count} command${count !== 1 ? 's' : ''}.`);
    return;
  }

  const name = args.join(' ');
  const commands = load();
  if (!(name in commands)) die(`no command named "${name}"`);
  delete commands[name];
  persist(commands);
  console.log(`Removed: "${name}"`);
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function die(msg, usage) {
  console.error(`gommand: ${msg}`);
  if (usage) console.error(`Usage: ${usage}`);
  process.exit(1);
}

function printHelp() {
  console.log(`
gommand v${VERSION} — run project commands from anywhere

USAGE
  gommand <name> [-- <extra args>]             Run a saved command
  gommand add <cmd> as <name>                  Save with current directory
  gommand add <cmd> -n <name>                  Same (flag style)
  gommand add --path <dir> <cmd> as <name>     Save with specific directory
  gommand list                                 List all saved commands
  gommand show <name>                          Show details for one command
  gommand test <name>                          Validate path and dry-run check
  gommand rename <old> to <new>                Rename a command
  gommand edit <name> --cmd <cmd>              Update the command string
  gommand edit --path <dir> <name>             Update the working directory
  gommand remove <name>                        Remove a command
  gommand remove --all                         Remove all commands

FLAG SYNTAX (alternative save)
  gommand --save <cmd> as <name>
  gommand --path <dir> --save <cmd> as <name>

ALIASES
  add → save    list → ls    remove → rm, del    rename → mv
  edit → update    show → info    test → check

EXAMPLES
  cd ~/dev/x
  gommand add make as "x build"                # save from current dir
  gommand add --path ~/dev/x make as "x build" # save from anywhere
  gommand add make -n "x build"               # flag style (no 'as' ambiguity)

  gommand x build                             # run (space = part of name)
  gommand "x build" -- clean                 # run as: make clean

  gommand list
  gommand show "x build"
  gommand rename "x build" to "x make"
  gommand edit "x make" --cmd "make -j4"
  gommand edit --path ~/dev/x2 "x make"
  gommand remove "x make"
  gommand remove --all

STORAGE  ~/.gommand/commands.json
`.trim());
  console.log('');
}
