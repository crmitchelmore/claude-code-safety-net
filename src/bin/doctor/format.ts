/**
 * Output formatting utilities for the doctor command.
 */

import type {
  ActivitySummary,
  ConfigSourceInfo,
  DoctorReport,
  EffectiveRule,
  EnvVarInfo,
  HookStatus,
  SystemInfo,
  UpdateInfo,
} from './types.ts';

// ANSI color codes (with TTY detection)
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const colors = {
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
};

const PLATFORM_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  'gemini-cli': 'Gemini CLI',
};

/**
 * Format the hooks section as a table with failure details below.
 */
export function formatHooksSection(hooks: HookStatus[]): string {
  const lines: string[] = [];

  lines.push('Hook Integration');
  lines.push(formatHooksTable(hooks));

  // Collect failures and errors
  const failures: Array<{
    platform: string;
    result: { description: string; expected: string; actual: string };
  }> = [];
  const warnings: Array<{ platform: string; message: string }> = [];
  const errors: Array<{ platform: string; message: string }> = [];

  for (const hook of hooks) {
    const platformName = PLATFORM_NAMES[hook.platform] ?? hook.platform;

    if (hook.selfTest) {
      for (const result of hook.selfTest.results) {
        if (!result.passed) {
          failures.push({ platform: platformName, result });
        }
      }
    }

    if (hook.errors && hook.errors.length > 0) {
      for (const err of hook.errors) {
        if (hook.configured) {
          warnings.push({ platform: platformName, message: err });
        } else {
          errors.push({ platform: platformName, message: err });
        }
      }
    }
  }

  // Show failures in red
  if (failures.length > 0) {
    lines.push('');
    lines.push(colors.red('   Failures:'));
    for (const f of failures) {
      lines.push(colors.red(`   • ${f.platform}: ${f.result.description}`));
      lines.push(colors.red(`     expected ${f.result.expected}, got ${f.result.actual}`));
    }
  }

  // Show warnings
  for (const w of warnings) {
    lines.push(`   Warning (${w.platform}): ${w.message}`);
  }

  // Show errors
  for (const e of errors) {
    lines.push(`   Error (${e.platform}): ${e.message}`);
  }

  return lines.join('\n');
}

/**
 * Format hooks as an ASCII table.
 */
function formatHooksTable(hooks: HookStatus[]): string {
  const headers = ['Platform', 'Status', 'Tests'];
  const rows = hooks.map((h) => {
    const platformName = PLATFORM_NAMES[h.platform] ?? h.platform;
    const statusText = h.configured ? 'Configured' : 'Not configured';
    let testsText = '-';
    if (h.configured && h.selfTest) {
      const label = h.selfTest.failed > 0 ? 'FAIL' : 'OK';
      testsText = `${h.selfTest.passed}/${h.selfTest.total} ${label}`;
    }
    return [platformName, statusText, testsText];
  });

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number) => s.padEnd(w);

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0)).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r) => `   ${formatRow(r)}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
}

/**
 * @internal Exported for testing
 * Format effective rules as an ASCII table.
 */
export function formatRulesTable(rules: EffectiveRule[]): string {
  if (rules.length === 0) {
    return '   (no custom rules)';
  }

  const headers = ['Source', 'Name', 'Command', 'Block Args'];
  const rows = rules.map((r) => [
    r.source,
    r.name,
    r.subcommand ? `${r.command} ${r.subcommand}` : r.command,
    r.blockArgs.join(', '),
  ]);

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number) => s.padEnd(w);

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0)).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r) => `   ${formatRow(r)}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
}

/**
 * Format the config section with tables.
 */
export function formatConfigSection(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push('Configuration');
  lines.push(formatConfigTable(report.userConfig, report.projectConfig));

  lines.push('');

  // Effective rules table
  if (report.effectiveRules.length > 0) {
    lines.push(`   Effective rules (${report.effectiveRules.length} total):`);
    lines.push(formatRulesTable(report.effectiveRules));
  } else {
    lines.push('   Effective rules: (none - using built-in rules only)');
  }

  // Shadow warnings
  for (const shadow of report.shadowedRules) {
    lines.push('');
    lines.push(`   Note: Project rule "${shadow.name}" shadows user rule with same name`);
  }

  return lines.join('\n');
}

/**
 * Format config sources as an ASCII table.
 */
function formatConfigTable(userConfig: ConfigSourceInfo, projectConfig: ConfigSourceInfo): string {
  const headers = ['Scope', 'Status'];

  const getStatus = (config: ConfigSourceInfo): string => {
    if (!config.exists) return 'Not found';
    if (!config.valid) {
      const errMsg = config.errors?.[0] ?? 'unknown error';
      return `Invalid (${errMsg})`;
    }
    return 'Configured';
  };

  const rows = [
    ['User', getStatus(userConfig)],
    ['Project', getStatus(projectConfig)],
  ];

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number) => s.padEnd(w);

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0)).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r) => `   ${formatRow(r)}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
}

/**
 * Format the environment section as a table with status icons.
 */
export function formatEnvironmentSection(envVars: EnvVarInfo[]): string {
  const lines: string[] = [];
  lines.push('Environment');
  lines.push(formatEnvironmentTable(envVars));

  return lines.join('\n');
}

/**
 * Format environment variables as an ASCII table with ✓/✗ icons.
 */
function formatEnvironmentTable(envVars: EnvVarInfo[]): string {
  const headers = ['Variable', 'Status'];
  const rows = envVars.map((v) => {
    const statusIcon = v.isSet ? colors.green('✓') : colors.dim('✗');
    return [v.name, statusIcon];
  });

  // Calculate column widths (using raw text without ANSI codes for width calc)
  const rawRows = envVars.map((v) => [v.name, v.isSet ? '✓' : '✗']);
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });

  const pad = (s: string, w: number, raw: string) => s + ' '.repeat(Math.max(0, w - raw.length));

  const line = (char: string, corners: [string, string, string]) =>
    corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];

  const formatRow = (cells: string[], rawCells: string[]) =>
    `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? '')).join(' │ ')} │`;

  const tableLines = [
    `   ${line('─', ['┌', '┬', '┐'])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line('─', ['├', '┼', '┤'])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line('─', ['└', '┴', '┘'])}`,
  ];

  return tableLines.join('\n');
}

/**
 * Format the activity section.
 */
export function formatActivitySection(activity: ActivitySummary): string {
  const lines: string[] = [];

  lines.push('Recent Activity');

  if (activity.totalBlocked === 0) {
    lines.push('   No blocked commands in the last 7 days');
    lines.push('   Tip: This is normal for new installations');
  } else {
    lines.push(
      `   ${activity.totalBlocked} commands blocked across ${activity.sessionCount} sessions`,
    );
    lines.push('');
    lines.push('   Latest:');
    for (const entry of activity.recentEntries) {
      const cmd = entry.command.length > 40 ? `${entry.command.slice(0, 37)}...` : entry.command;
      lines.push(`   • ${entry.relativeTime.padEnd(8)} ${cmd}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format the update section.
 */
export function formatUpdateSection(update: UpdateInfo): string {
  const lines: string[] = [];
  lines.push('Update Available');
  lines.push(`   Installed: ${update.currentVersion}`);
  lines.push(`   Latest:    ${update.latestVersion}`);
  lines.push('');
  lines.push('   Run: bunx cc-safety-net@latest doctor');
  lines.push('   Or:  npx cc-safety-net@latest doctor');

  return lines.join('\n');
}

/**
 * Format the system info section.
 */
export function formatSystemInfoSection(system: SystemInfo): string {
  const lines: string[] = [];
  lines.push('System Info');

  // Define label width for alignment (longest label is "cc-safety-net:" = 14 chars)
  const labelWidth = 17;
  const formatLine = (label: string, value: string | null): string => {
    const displayValue = value ?? 'not found';
    return `   ${label.padEnd(labelWidth)}${displayValue}`;
  };

  lines.push(formatLine('cc-safety-net:', system.version));
  lines.push(formatLine('Claude Code:', system.claudeCodeVersion));
  lines.push(formatLine('OpenCode:', system.openCodeVersion));
  lines.push(formatLine('Gemini CLI:', system.geminiCliVersion));
  lines.push(formatLine('Node.js:', system.nodeVersion));
  lines.push(formatLine('npm:', system.npmVersion));
  lines.push(formatLine('Bun:', system.bunVersion));
  lines.push(formatLine('Platform:', system.platform));

  return lines.join('\n');
}

/**
 * Format the summary line.
 */
export function formatSummary(report: DoctorReport): string {
  const hooksFailed = report.hooks.every((h) => !h.configured);
  const selfTestFailed = report.hooks.some((h) => h.selfTest && h.selfTest.failed > 0);
  const configFailed =
    (report.userConfig.errors?.length ?? 0) > 0 || (report.projectConfig.errors?.length ?? 0) > 0;

  const failures = [hooksFailed, selfTestFailed, configFailed].filter(Boolean).length;

  // Count warnings
  let warnings = 0;
  if (report.update.updateAvailable) warnings++;
  if (report.activity.totalBlocked === 0) warnings++;
  warnings += report.shadowedRules.length;

  if (failures > 0) {
    return colors.red(`\n${failures} check(s) failed.`);
  }

  if (warnings > 0) {
    return colors.yellow(`\nAll checks passed with ${warnings} warning(s).`);
  }

  return colors.green('\nAll checks passed.');
}
