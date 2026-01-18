/**
 * Output formatting utilities for the doctor command.
 */
import type { ActivitySummary, DirPermissions, DoctorReport, EffectiveRule, EnvVarInfo, HookStatus, SystemInfo, UpdateInfo } from './types.ts';
export declare function formatHeader(): string;
/**
 * Format the hooks section with integrated self-test results.
 */
export declare function formatHooksSection(hooks: HookStatus[]): string;
/**
 * @internal Exported for testing
 * Format effective rules as an ASCII table.
 */
export declare function formatRulesTable(rules: EffectiveRule[]): string;
/**
 * Format the config section with rules table.
 */
export declare function formatConfigSection(report: DoctorReport): string;
/**
 * Format the environment section.
 */
export declare function formatEnvironmentSection(envVars: EnvVarInfo[]): string;
/**
 * Format the activity section.
 */
export declare function formatActivitySection(activity: ActivitySummary): string;
/**
 * Format the permissions section.
 */
export declare function formatPermissionsSection(permissions: {
    configDir: DirPermissions;
    logDir: DirPermissions;
}): string;
/**
 * Format the update section.
 */
export declare function formatUpdateSection(update: UpdateInfo): string;
/**
 * Format the system info section.
 */
export declare function formatSystemInfoSection(system: SystemInfo): string;
/**
 * Format the summary line.
 */
export declare function formatSummary(report: DoctorReport): string;
