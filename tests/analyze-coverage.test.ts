import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { analyzeCommand } from "../src/core/analyze.ts";
import type { Config } from "../src/types.ts";

const EMPTY_CONFIG: Config = { version: 1, rules: [] };

describe("analyzeCommand (coverage)", () => {
	test("unclosed-quote cd segment handled", () => {
		// Ensures cwd-tracking fallback runs for unparseable cd segments.
		expect(
			analyzeCommand('cd "unterminated', {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			}),
		).toBeNull();
	});

	test("empty head token returns null", () => {
		expect(
			analyzeCommand('""', {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			}),
		).toBeNull();
	});

	test("rm -rf in home cwd is blocked with dedicated message", () => {
		const reason = analyzeCommand("rm -rf build", {
			cwd: homedir(),
			config: EMPTY_CONFIG,
		});
		expect(reason).toContain("rm -rf in home directory");
	});

	test("rm without -rf in home cwd is not blocked by home cwd guard", () => {
		expect(
			analyzeCommand("rm -f file.txt", {
				cwd: homedir(),
				config: EMPTY_CONFIG,
			}),
		).toBeNull();
	});

	test("custom rules can block rm after builtin allow", () => {
		const config: Config = {
			version: 1,
			rules: [
				{
					name: "block-rm-rf",
					command: "rm",
					block_args: ["-rf"],
					reason: "No rm -rf.",
				},
			],
		};
		const reason = analyzeCommand("rm -rf /tmp/test-dir", {
			cwd: "/tmp",
			config,
		});
		expect(reason).toContain("[block-rm-rf] No rm -rf.");
	});

	test("custom rules can block find after builtin allow", () => {
		const config: Config = {
			version: 1,
			rules: [
				{
					name: "block-find-print",
					command: "find",
					block_args: ["-print"],
					reason: "Avoid find -print in tests.",
				},
			],
		};
		const reason = analyzeCommand("find . -print", { cwd: "/tmp", config });
		expect(reason).toContain("[block-find-print] Avoid find -print in tests.");
	});

	test("fallback scan catches embedded rm", () => {
		const reason = analyzeCommand("tool rm -rf /", {
			cwd: "/tmp",
			config: EMPTY_CONFIG,
		});
		expect(reason).toContain("extremely dangerous");
	});

	test("fallback scan ignores embedded rm when analyzeRm allows it", () => {
		expect(
			analyzeCommand("tool rm -rf /tmp/a", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			}),
		).toBeNull();
	});

	test("fallback scan catches embedded git", () => {
		const reason = analyzeCommand("tool git reset --hard", {
			cwd: "/tmp",
			config: EMPTY_CONFIG,
		});
		expect(reason).toContain("git reset --hard");
	});

	test("fallback scan ignores embedded git when safe", () => {
		expect(
			analyzeCommand("tool git status", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			}),
		).toBeNull();
	});

	test("fallback scan catches embedded find", () => {
		const reason = analyzeCommand("tool find . -delete", {
			cwd: "/tmp",
			config: EMPTY_CONFIG,
		});
		expect(reason).toContain("find -delete");
	});

	test("fallback scan ignores embedded find when safe", () => {
		expect(
			analyzeCommand("tool find . -print", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			}),
		).toBeNull();
	});

	test("TMPDIR override to a temp dir keeps $TMPDIR allowed", () => {
		const reason = analyzeCommand("TMPDIR=/tmp rm -rf $TMPDIR/test-dir", {
			cwd: "/tmp",
			config: EMPTY_CONFIG,
		});
		expect(reason).toBeNull();
	});

	test("xargs child git command is analyzed", () => {
		const reason = analyzeCommand("xargs git reset --hard", {
			cwd: "/tmp",
			config: EMPTY_CONFIG,
		});
		expect(reason).toContain("git reset --hard");
	});

	test("xargs child git command can be safe", () => {
		expect(
			analyzeCommand("xargs git status", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			}),
		).toBeNull();
	});

	describe("parallel parsing/analysis branches", () => {
		test("parallel bash -c with placeholder and no args analyzes template", () => {
			const reason = analyzeCommand("parallel bash -c 'echo {}'", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			});
			expect(reason).toBeNull();
		});

		test("parallel bash -c with placeholder outside script is blocked", () => {
			const reason = analyzeCommand("parallel bash -c 'echo hi' {} ::: a", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			});
			expect(reason).toContain("parallel with shell -c");
		});

		test("parallel bash -c without script but with args is blocked", () => {
			const reason = analyzeCommand("parallel bash -c ::: 'echo hi'", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			});
			expect(reason).toContain("parallel with shell -c");
		});

		test("parallel bash -c without script or args is allowed", () => {
			expect(
				analyzeCommand("parallel bash -c", {
					cwd: "/tmp",
					config: EMPTY_CONFIG,
				}),
			).toBeNull();
		});

		test("parallel bash with placeholder but missing -c arg is blocked", () => {
			const reason = analyzeCommand("parallel bash {} -c", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			});
			expect(reason).toContain("parallel with shell -c");
		});

		test("parallel rm -rf with explicit temp arg is allowed", () => {
			const reason = analyzeCommand("parallel rm -rf ::: /tmp/a", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			});
			expect(reason).toBeNull();
		});

		test("parallel git tokens are analyzed", () => {
			const reason = analyzeCommand("parallel git reset --hard :::", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			});
			expect(reason).toContain("git reset --hard");
		});

		test("parallel with -- separator parses template", () => {
			const reason = analyzeCommand("parallel -- rm -rf ::: /tmp/a", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			});
			expect(reason).toBeNull();
		});

		test("parallel -j option consumes its value", () => {
			const reason = analyzeCommand("parallel -j 4 rm -rf ::: /tmp/a", {
				cwd: "/tmp",
				config: EMPTY_CONFIG,
			});
			expect(reason).toBeNull();
		});
	});
});
