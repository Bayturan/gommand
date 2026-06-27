# gommand

Run project commands from anywhere. Save a command once with its working directory, then call it globally — like a personal shortcut layer over `make`, scripts, or any shell command.

```sh
# in ~/dev/x
gommand add make as "x build"

# anywhere else
gommand x build
```

---

## Install

**npm**
```sh
npm install -g gommand
```

**bun**
```sh
bun install -g gommand
```

**deno**
```sh
deno install -g npm:gommand
```

Works with Node.js ≥ 18, Bun, and Deno. No dependencies.

---

## Usage

### Save a command

From your project directory:
```sh
cd ~/dev/x
gommand add make as "x build"
```

From anywhere with `--path`:
```sh
gommand add --path ~/dev/x make as "x build"
```

With `-n` instead of `as` (avoids ambiguity when the command contains the word "as"):
```sh
gommand add make -n "x build"
```

Flag style:
```sh
gommand --save make as "x build"
gommand --path ~/dev/x --save make as "x build"
```

### Run a command

```sh
gommand x build
gommand "x build"        # same — quoting is optional for single-word names
```

Pass extra args to the underlying command with `--`:
```sh
gommand "x build" -- clean       # runs: make clean  (in ~/dev/x)
gommand "x build" -- -j8         # runs: make -j8
```

### List saved commands

```sh
gommand list
```

```
   1.  x build    →  make  (~/dev/x)
   2.  api start  →  npm run dev  (/srv/api)
```

### Show details

```sh
gommand show "x build"
```

```
  Name:    x build
  Command: make
  Path:    /home/user/dev/x
  Status:  path ok
```

### Rename

```sh
gommand rename "x build" to "x make"
gommand rename xbuild xmake          # no quotes needed for single-word names
```

### Edit

Update the command:
```sh
gommand edit "x build" --cmd "make -j4"
```

Update the working directory:
```sh
gommand edit --path ~/dev/x2 "x build"
```

Update both at once:
```sh
gommand edit --path ~/dev/x2 "x build" --cmd "make all"
```

### Remove

```sh
gommand remove "x build"
gommand remove --all
```

---

## Reference

| Command | Aliases | Description |
|---|---|---|
| `gommand <name>` | | Run a saved command |
| `gommand <name> -- <args>` | | Run with extra args appended |
| `gommand add <cmd> as <name>` | `save` | Save with current directory |
| `gommand add --path <dir> <cmd> as <name>` | | Save with specific directory |
| `gommand list` | `ls` | List all saved commands |
| `gommand show <name>` | `info` | Show details for one command |
| `gommand rename <old> to <new>` | `mv` | Rename a command |
| `gommand edit <name> --cmd <cmd>` | `update` | Update the command string |
| `gommand edit --path <dir> <name>` | `update` | Update the working directory |
| `gommand remove <name>` | `rm`, `del` | Remove a command |
| `gommand remove --all` | | Remove all commands |
| `gommand --version` | `-V` | Print version |
| `gommand --help` | `-h` | Print help |

Commands are stored in `~/.gommand/commands.json`.
