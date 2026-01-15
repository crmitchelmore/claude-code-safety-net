/**
 * Verify user and project scope config files for safety-net.
 */
export interface VerifyConfigOptions {
    userConfigPath?: string;
    projectConfigPath?: string;
}
/**
 * Verify config files and print results.
 * @returns Exit code (0 = success, 1 = errors found)
 */
export declare function verifyConfig(options?: VerifyConfigOptions): number;
