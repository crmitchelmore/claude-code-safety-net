#!/usr/bin/env node
import { analyzeCommand, loadConfig } from '../core/analyze.ts';
import { redactSecrets, writeAuditLog } from '../core/audit.ts';
import { CUSTOM_RULES_DOC } from '../core/custom-rules-doc.ts';
import { envTruthy } from '../core/env.ts';
import { formatBlockedMessage } from '../core/format.ts';
import { verifyConfig } from '../core/verify-config.ts';
import type {
  CopilotHookInput,
  CopilotHookOutput,
  GeminiHookInput,
  GeminiHookOutput,
  HookInput,
  HookOutput,
} from '../types.ts';

const VERSION = '0.5.0';

function printHelp(): void {
  console.log(`cc-safety-net v${VERSION}

Blocks destructive git and filesystem commands before execution.

USAGE:
  cc-safety-net -cc, --claude-code       Run as Claude Code PreToolUse hook (reads JSON from stdin)
  cc-safety-net -gc, --gemini-cli        Run as Gemini CLI BeforeTool hook (reads JSON from stdin)
  cc-safety-net -pc, --copilot-cli       Run as Copilot CLI preToolUse hook (reads JSON from stdin)
  cc-safety-net -vc, --verify-config     Validate config files
  cc-safety-net --custom-rules-doc       Print custom rules documentation
  cc-safety-net -h,  --help              Show this help
  cc-safety-net -V,  --version           Show version

ENVIRONMENT VARIABLES:
  SAFETY_NET_STRICT=1             Fail-closed on unparseable commands
  SAFETY_NET_PARANOID=1           Enable all paranoid checks
  SAFETY_NET_PARANOID_RM=1        Block non-temp rm -rf within cwd
  SAFETY_NET_PARANOID_INTERPRETERS=1  Block interpreter one-liners

CONFIG FILES:
  ~/.cc-safety-net/config.json    User-scope config
  .safety-net.json                Project-scope config`);
}

function printVersion(): void {
  console.log(VERSION);
}

function printCustomRulesDoc(): void {
  console.log(CUSTOM_RULES_DOC);
}

type HookMode = 'claude-code' | 'gemini-cli' | 'copilot-cli';

function handleCliFlags(): HookMode | null {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-V')) {
    printVersion();
    process.exit(0);
  }

  if (args.includes('--verify-config') || args.includes('-vc')) {
    process.exit(verifyConfig());
  }

  if (args.includes('--custom-rules-doc')) {
    printCustomRulesDoc();
    process.exit(0);
  }

  if (args.includes('--claude-code') || args.includes('-cc')) {
    return 'claude-code';
  }

  if (args.includes('--gemini-cli') || args.includes('-gc')) {
    return 'gemini-cli';
  }

  if (args.includes('--copilot-cli') || args.includes('-pc')) {
    return 'copilot-cli';
  }

  console.error(`Unknown option: ${args[0]}`);
  console.error("Run 'cc-safety-net --help' for usage.");
  process.exit(1);
}

async function runClaudeCodeHook(): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const inputText = Buffer.concat(chunks).toString('utf-8').trim();

  if (!inputText) {
    return;
  }

  let input: HookInput;
  try {
    input = JSON.parse(inputText) as HookInput;
  } catch {
    if (envTruthy('SAFETY_NET_STRICT')) {
      outputDeny('Failed to parse hook input JSON (strict mode)');
    }
    return;
  }

  if (input.tool_name !== 'Bash') {
    return;
  }

  const command = input.tool_input?.command;
  if (!command) {
    return;
  }

  const cwd = input.cwd ?? process.cwd();
  const strict = envTruthy('SAFETY_NET_STRICT');
  const paranoidAll = envTruthy('SAFETY_NET_PARANOID');
  const paranoidRm = paranoidAll || envTruthy('SAFETY_NET_PARANOID_RM');
  const paranoidInterpreters = paranoidAll || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS');

  const config = loadConfig(cwd);

  const result = analyzeCommand(command, {
    cwd,
    config,
    strict,
    paranoidRm,
    paranoidInterpreters,
  });

  if (result) {
    const sessionId = input.session_id;
    if (sessionId) {
      writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
    }
    outputDeny(result.reason, command, result.segment);
  }
}

function outputDeny(reason: string, command?: string, segment?: string): void {
  const message = formatBlockedMessage({
    reason,
    command,
    segment,
    redact: redactSecrets,
  });

  const output: HookOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  };

  console.log(JSON.stringify(output));
}

async function runGeminiCLIHook(): Promise<void> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const inputText = Buffer.concat(chunks).toString('utf-8').trim();

  if (!inputText) {
    return;
  }

  let input: GeminiHookInput;
  try {
    input = JSON.parse(inputText) as GeminiHookInput;
  } catch {
    if (envTruthy('SAFETY_NET_STRICT')) {
      outputGeminiDeny('Failed to parse hook input JSON (strict mode)');
    }
    return;
  }

  if (input.hook_event_name !== 'BeforeTool') {
    return;
  }

  if (input.tool_name !== 'run_shell_command') {
    return;
  }

  const command = input.tool_input?.command;
  if (!command) {
    return;
  }

  const cwd = input.cwd ?? process.cwd();
  const strict = envTruthy('SAFETY_NET_STRICT');
  const paranoidAll = envTruthy('SAFETY_NET_PARANOID');
  const paranoidRm = paranoidAll || envTruthy('SAFETY_NET_PARANOID_RM');
  const paranoidInterpreters = paranoidAll || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS');

  const config = loadConfig(cwd);

  const result = analyzeCommand(command, {
    cwd,
    config,
    strict,
    paranoidRm,
    paranoidInterpreters,
  });

  if (result) {
    const sessionId = input.session_id;
    if (sessionId) {
      writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
    }
    outputGeminiDeny(result.reason, command, result.segment);
  }
}

function outputCopilotDeny(reason: string, command?: string, segment?: string): void {
  const message = formatBlockedMessage({
    reason,
    command,
    segment,
    redact: redactSecrets,
  });

  const output: CopilotHookOutput = {
    permissionDecision: 'deny',
    permissionDecisionReason: message,
  };

  console.log(JSON.stringify(output));
}

function outputGeminiDeny(reason: string, command?: string, segment?: string): void {
  const message = formatBlockedMessage({
    reason,
    command,
    segment,
    redact: redactSecrets,
  });

  // Gemini CLI expects exit code 0 with JSON for policy blocks; exit 2 is for hook errors.
  const output: GeminiHookOutput = {
    decision: 'deny',
    reason: message,
    systemMessage: message,
  };

  console.log(JSON.stringify(output));
}

function readStdinTextSync(): Promise<string> {
  return (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf-8').trim();
  })();
}

function getString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function getNestedString(obj: unknown, key1: string, key2: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v1 = (obj as Record<string, unknown>)[key1];
  return getString(v1, key2);
}

async function runCopilotCLIHook(): Promise<void> {
  const inputText = await readStdinTextSync();
  if (!inputText) return;

  let input: CopilotHookInput;
  try {
    input = JSON.parse(inputText) as CopilotHookInput;
  } catch {
    if (envTruthy('SAFETY_NET_STRICT')) {
      outputCopilotDeny('Failed to parse hook input JSON (strict mode)');
    }
    return;
  }

  const eventName =
    input.hookEventName ??
    input.hook_event_name ??
    input.eventName ??
    input.event_name ??
    getString(input, 'hookEventName') ??
    getString(input, 'hook_event_name') ??
    getString(input, 'eventName') ??
    getString(input, 'event_name');

  if (eventName && eventName.toLowerCase() !== 'pretooluse') {
    return;
  }

  const command =
    input.toolInput?.command ??
    input.tool_input?.command ??
    getNestedString(input, 'toolInput', 'command') ??
    getNestedString(input, 'tool_input', 'command') ??
    getString(input, 'command');

  if (!command) return;

  const cwd = input.cwd ?? getString(input, 'cwd') ?? process.cwd();
  const strict = envTruthy('SAFETY_NET_STRICT');
  const paranoidAll = envTruthy('SAFETY_NET_PARANOID');
  const paranoidRm = paranoidAll || envTruthy('SAFETY_NET_PARANOID_RM');
  const paranoidInterpreters = paranoidAll || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS');

  const config = loadConfig(cwd);

  const result = analyzeCommand(command, {
    cwd,
    config,
    strict,
    paranoidRm,
    paranoidInterpreters,
  });

  if (result) {
    const sessionId = getString(input, 'sessionId') ?? getString(input, 'session_id');
    if (sessionId) {
      writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
    }
    outputCopilotDeny(result.reason, command, result.segment);
  }
}

async function main(): Promise<void> {
  const mode = handleCliFlags();
  if (mode === 'claude-code') {
    await runClaudeCodeHook();
  } else if (mode === 'gemini-cli') {
    await runGeminiCLIHook();
  } else if (mode === 'copilot-cli') {
    await runCopilotCLIHook();
  }
}

main().catch((error: unknown) => {
  console.error('Safety Net error:', error);
  process.exit(1);
});
