import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { normalize, resolve } from "node:path";

const REASON_RM_RF =
	"rm -rf outside cwd is blocked. Use explicit paths within the current directory, or delete manually.";
const REASON_RM_RF_ROOT_HOME =
	"rm -rf targeting root or home directory is extremely dangerous and always blocked.";

export interface AnalyzeRmOptions {
	cwd?: string;
	originalCwd?: string;
	paranoid?: boolean;
	allowTmpdirVar?: boolean;
	tmpdirOverridden?: boolean;
}

export function analyzeRm(
	tokens: string[],
	options: AnalyzeRmOptions = {},
): string | null {
	const {
		cwd,
		originalCwd,
		paranoid = false,
		allowTmpdirVar = true,
		tmpdirOverridden = false,
	} = options;
	const checkCwd = originalCwd ?? cwd;
	const effectiveCwd = cwd;

	if (!hasRecursiveForce(tokens)) {
		return null;
	}

	const targets = extractRmTargets(tokens);

	for (const target of targets) {
		if (isRootOrHomePath(target)) {
			return REASON_RM_RF_ROOT_HOME;
		}

		if (checkCwd) {
			if (isCwdItself(target, checkCwd)) {
				return REASON_RM_RF;
			}
		}

		if (isTempPath(target, allowTmpdirVar && !tmpdirOverridden)) {
			continue;
		}

		if (checkCwd) {
			if (isCwdHome(checkCwd)) {
				return REASON_RM_RF_ROOT_HOME;
			}

			if (isPathWithinCwd(target, checkCwd, effectiveCwd)) {
				if (paranoid) {
					return `${REASON_RM_RF} (SAFETY_NET_PARANOID_RM enabled)`;
				}
				continue;
			}
		}

		return REASON_RM_RF;
	}

	return null;
}

function hasRecursiveForce(tokens: string[]): boolean {
	let hasRecursive = false;
	let hasForce = false;
	let pastDoubleDash = false;

	for (const token of tokens) {
		if (token === "--") {
			pastDoubleDash = true;
			continue;
		}
		if (pastDoubleDash) continue;

		if (token === "-r" || token === "-R" || token === "--recursive") {
			hasRecursive = true;
		} else if (token === "-f" || token === "--force") {
			hasForce = true;
		} else if (token.startsWith("-") && !token.startsWith("--")) {
			if (token.includes("r") || token.includes("R")) {
				hasRecursive = true;
			}
			if (token.includes("f")) {
				hasForce = true;
			}
		}
	}

	return hasRecursive && hasForce;
}

function extractRmTargets(tokens: string[]): string[] {
	const targets: string[] = [];
	let pastDoubleDash = false;

	for (let i = 1; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;

		if (token === "--") {
			pastDoubleDash = true;
			continue;
		}

		if (pastDoubleDash) {
			targets.push(token);
			continue;
		}

		if (!token.startsWith("-")) {
			targets.push(token);
		}
	}

	return targets;
}

function isRootOrHomePath(path: string): boolean {
	const normalized = path.trim();

	if (normalized === "/" || normalized === "/*") {
		return true;
	}

	if (
		normalized === "~" ||
		normalized === "~/" ||
		normalized.startsWith("~/")
	) {
		if (normalized === "~" || normalized === "~/" || normalized === "~/*") {
			return true;
		}
	}

	if (
		normalized === "$HOME" ||
		normalized === "$HOME/" ||
		normalized === "$HOME/*"
	) {
		return true;
	}

	if (
		normalized === "${HOME}" ||
		normalized === "${HOME}/" ||
		normalized === "${HOME}/*"
	) {
		return true;
	}

	return false;
}

function isTempPath(path: string, allowTmpdirVar: boolean): boolean {
	const normalized = path.trim();

	if (normalized.includes("..")) {
		return false;
	}

	if (normalized === "/tmp" || normalized.startsWith("/tmp/")) {
		return true;
	}

	if (normalized === "/var/tmp" || normalized.startsWith("/var/tmp/")) {
		return true;
	}

	const systemTmpdir = tmpdir();
	if (
		normalized.startsWith(`${systemTmpdir}/`) ||
		normalized === systemTmpdir
	) {
		return true;
	}

	if (allowTmpdirVar) {
		if (normalized === "$TMPDIR" || normalized.startsWith("$TMPDIR/")) {
			return true;
		}
		if (normalized === "${TMPDIR}" || normalized.startsWith("${TMPDIR}/")) {
			return true;
		}
	}

	return false;
}

function isCwdHome(cwd: string): boolean {
	const home = process.env.HOME || homedir();
	try {
		const normalizedCwd = normalize(cwd);
		const normalizedHome = normalize(home);
		return normalizedCwd === normalizedHome;
	} catch {
		return false;
	}
}

function isCwdItself(target: string, cwd: string): boolean {
	if (target === "." || target === "./") {
		return true;
	}

	try {
		const resolved = resolve(cwd, target);
		const realCwd = realpathSync(cwd);
		const realResolved = realpathSync(resolved);
		return realResolved === realCwd;
	} catch {
		try {
			const resolved = resolve(cwd, target);
			const normalizedCwd = normalize(cwd);
			return resolved === normalizedCwd;
		} catch {
			return false;
		}
	}
}

function isPathWithinCwd(
	target: string,
	originalCwd: string,
	effectiveCwd?: string,
): boolean {
	const resolveCwd = effectiveCwd ?? originalCwd;
	if (
		target.startsWith("~") ||
		target.startsWith("$HOME") ||
		target.startsWith("${HOME}")
	) {
		return false;
	}

	if (target.includes("$") || target.includes("`")) {
		return false;
	}

	if (target.startsWith("/")) {
		try {
			const normalizedTarget = normalize(target);
			const normalizedCwd = `${normalize(originalCwd)}/`;
			return normalizedTarget.startsWith(normalizedCwd);
		} catch {
			return false;
		}
	}

	if (target.startsWith("./") || !target.includes("/")) {
		try {
			const resolved = resolve(resolveCwd, target);
			const normalizedOriginalCwd = normalize(originalCwd);
			return (
				resolved.startsWith(`${normalizedOriginalCwd}/`) ||
				resolved === normalizedOriginalCwd
			);
		} catch {
			return false;
		}
	}

	if (target.startsWith("../")) {
		return false;
	}

	try {
		const resolved = resolve(resolveCwd, target);
		const normalizedCwd = normalize(originalCwd);
		return (
			resolved.startsWith(`${normalizedCwd}/`) || resolved === normalizedCwd
		);
	} catch {
		return false;
	}
}

export function isHomeDirectory(cwd: string): boolean {
	const home = homedir();
	const normalizedCwd = normalize(cwd);
	const normalizedHome = normalize(home);
	return normalizedCwd === normalizedHome;
}
