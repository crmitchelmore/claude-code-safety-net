/**
 * Filesystem permissions checking for the doctor command.
 */
import type { DirPermissions } from './types.ts';
export declare function checkPermissions(): {
    configDir: DirPermissions;
    logDir: DirPermissions;
};
