import type { Plugin } from "@opencode-ai/plugin";
import { analyzeCommand, loadConfig } from "./core/analyze.ts";
import type { AnalyzeOptions, Config, CustomRule } from "./types.ts";

export { analyzeCommand, loadConfig };
export type { AnalyzeOptions, Config, CustomRule };

export { validateConfig, validateConfigFile } from "./core/config.ts";

export const SafetyNetPlugin: Plugin = async ({ directory }) => {
	const config = loadConfig();

	return {
		"tool.execute.before": async (input, output) => {
			if (input.tool === "bash") {
				const result = analyzeCommand(output.args.command, {
					cwd: directory,
					config,
				});
				if (result) {
					throw new Error(`BLOCKED by Safety Net\n\nReason: ${result}`);
				}
			}
		},
	};
};
