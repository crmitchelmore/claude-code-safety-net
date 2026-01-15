---
description: Set Safety Net status line in Claude Code settings
allowed-tools: Bash, Read, Write, AskUserQuestion
---

You are helping the user configure the Safety Net status line in their Claude Code settings.

## Context

### Schema Documentation

The `statusLine` field in `~/.claude/settings.json` has this structure:

```json
{
  "statusLine": {
    "type": "command",
    "command": "<shell command to execute>",
    "padding": <optional number>
  }
}
```

- `type`: Must be `"command"`
- `command`: Shell command that outputs the status line text
- `padding`: Optional number for spacing

## Your Task

Follow this flow exactly:

### Step 1: Ask for Package Runner

Use AskUserQuestion to let user select their preferred package runner:

```json
{
  "questions": [
    {
      "question": "Which package runner would you like to use?",
      "header": "Runner",
      "multiSelect": false,
      "options": [
        {
          "label": "bunx (Recommended)",
          "description": "Uses Bun's package runner - faster startup"
        },
        {
          "label": "npx",
          "description": "Uses npm's package runner - more widely available"
        }
      ]
    }
  ]
}
```

### Step 2: Check Existing Settings

Read the current settings file:

```bash
cat ~/.claude/settings.json 2>/dev/null || echo "{}"
```

Parse the JSON and check if `statusLine.command` already exists.

### Step 3: Handle Existing Command

If `statusLine.command` already exists:

1. Show the current command to the user
2. Use AskUserQuestion to let user choose:

```json
{
  "questions": [
    {
      "question": "The statusLine command is already set. What would you like to do?",
      "header": "Existing",
      "multiSelect": false,
      "options": [
        {
          "label": "Replace",
          "description": "Replace the existing command with Safety Net statusline"
        },
        {
          "label": "Pipe",
          "description": "Add Safety Net at the end using pipe (existing_command | cc-safety-net --statusline)"
        }
      ]
    }
  ]
}
```

### Step 4: Generate the Configuration

Based on user choices:

**If Replace or no existing command:**
```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx cc-safety-net --statusline"
  }
}
```
(Use `npx -y` instead of `bunx` if user selected npx)

**If Pipe:**
```json
{
  "statusLine": {
    "type": "command",
    "command": "<existing_command> | bunx cc-safety-net --statusline"
  }
}
```

### Step 5: Show and Confirm

Show the generated config to the user.

Use AskUserQuestion to confirm:

```json
{
  "questions": [
    {
      "question": "Does this configuration look correct?",
      "header": "Confirm",
      "multiSelect": false,
      "options": [
        {
          "label": "Yes, apply it",
          "description": "Write the configuration to ~/.claude/settings.json"
        },
        {
          "label": "No, cancel",
          "description": "Cancel without making changes"
        }
      ]
    }
  ]
}
```

### Step 6: Write Configuration

If user confirms:

1. Read existing `~/.claude/settings.json` (or start with `{}` if it doesn't exist)
2. Merge the new `statusLine` configuration
3. Write back to `~/.claude/settings.json` with proper JSON formatting (2-space indent)

Use the Write tool to update the file.

### Step 7: Confirm Success

Tell the user:
1. Configuration saved to `~/.claude/settings.json`
2. **Changes take effect immediately** - no restart needed
3. Summary of what was configured

## Important Notes

- The settings file is located at `~/.claude/settings.json`
- If the file doesn't exist, create it with the statusLine configuration
- Preserve all existing settings when merging
- Use `npx -y` (not just `npx`) to skip prompts when using npm
