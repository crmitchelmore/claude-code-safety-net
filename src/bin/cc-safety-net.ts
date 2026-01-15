#!/usr/bin/env node
import { runClaudeCodeHook } from './claude-code.ts';
import { CUSTOM_RULES_DOC } from './custom-rules-doc.ts';
import { runGeminiCLIHook } from './gemini-cli.ts';
import { printHelp, printVersion } from './help.ts';
import { printStatusline } from './statusline.ts';
import { verifyConfig } from './verify-config.ts';

function printCustomRulesDoc(): void {
  console.log(CUSTOM_RULES_DOC);
}

type HookMode = 'claude-code' | 'gemini-cli' | 'statusline';

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

  if (args.includes('--statusline')) {
    return 'statusline';
  }

  if (args.includes('--claude-code') || args.includes('-cc')) {
    return 'claude-code';
  }

  if (args.includes('--gemini-cli') || args.includes('-gc')) {
    return 'gemini-cli';
  }

  console.error(`Unknown option: ${args[0]}`);
  console.error("Run 'cc-safety-net --help' for usage.");
  process.exit(1);
}

async function main(): Promise<void> {
  const mode = handleCliFlags();
  if (mode === 'claude-code') {
    await runClaudeCodeHook();
  } else if (mode === 'gemini-cli') {
    await runGeminiCLIHook();
  } else if (mode === 'statusline') {
    await printStatusline();
  }
}

main().catch((error: unknown) => {
  console.error('Safety Net error:', error);
  process.exit(1);
});
