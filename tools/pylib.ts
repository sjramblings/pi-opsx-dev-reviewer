// Faithful-port helpers: Python semantics that differ from the JS defaults.
// Shared by waf-grounding.ts and arch-lint.ts. Every function here exists because a
// naive JS equivalent diverges from CPython on real inputs.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Line boundaries per CPython str.splitlines(), built from ASCII escapes so the
// source file stays pure ASCII (literal U+2028/U+2029 do not survive round-trips).
const LINE_BOUNDARY_RE = new RegExp(
  "\\r\\n|[\\n\\r\\v\\f\\u001c\\u001d\\u001e\\u0085\\u2028\\u2029]",
);

/** Python str.splitlines(): splits on the full line-boundary set and drops a single
 *  trailing empty field. "a\n" -> ["a"], "" -> [], "\n" -> [""]. */
export function splitlines(text: string): string[] {
  if (text === "") return [];
  const parts = text.split(LINE_BOUNDARY_RE);
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

// Every codepoint outside 0x20-0x7e, matching CPython ESCAPE_ASCII.
const NON_ASCII_RE = new RegExp("[\\u007f-\\uffff]", "g");

/** Python json.dumps(..., indent=2): ensure_ascii=True escapes every codepoint outside
 *  0x20-0x7e as \uXXXX. JSON.stringify emits them literally, so output would diverge on
 *  any non-ASCII title. Surrogate pairs are escaped per-unit, exactly as CPython does. */
export function pyJsonDumps(value: unknown, indent = 2): string {
  const s = JSON.stringify(value, null, indent);
  return s.replace(NON_ASCII_RE, (ch) =>
    "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/** Python os.path.expanduser(): expands a leading ~ only. */
export function expandUser(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** PurePath normalisation: collapse repeated separators and drop "." components,
 *  preserving ".." and a leading "/". Path("./a//b/.") -> "a/b". */
export function pyPath(p: string): string {
  if (p === "") return ".";
  const absolute = p.startsWith("/");
  const parts = p.split("/").filter((c) => c !== "" && c !== ".");
  const joined = parts.join("/");
  if (absolute) return "/" + joined;
  return joined === "" ? "." : joined;
}

/** Python Path.resolve(strict=False): make absolute and resolve symlinks through the
 *  longest existing prefix, then re-append the non-existent tail. */
export function resolvePath(p: string): string {
  const abs = path.resolve(expandUser(p));
  try {
    return fs.realpathSync(abs);
  } catch {
    // fall through to prefix resolution
  }
  const parts = abs.split(path.sep);
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join(path.sep) || path.sep;
    try {
      const real = fs.realpathSync(prefix);
      return path.join(real, ...parts.slice(i));
    } catch {
      continue;
    }
  }
  return abs;
}

/** Python Path.relative_to(): purely lexical containment, no symlink resolution.
 *  Returns false where CPython would raise ValueError. */
export function isRelativeTo(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
}

/** Python sorted() over Path objects compares the parts tuple, not the raw string.
 *  "a/b.md" sorts BEFORE "a-b/c.md" ('-' < '/' as raw strings would invert this). */
export function comparePaths(a: string, b: string): number {
  const pa = a.split(path.sep);
  const pb = b.split(path.sep);
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** Python str.strip(chars): strip any of the given characters from both ends. */
export function stripChars(value: string, chars: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && chars.includes(value[start])) start++;
  while (end > start && chars.includes(value[end - 1])) end--;
  return value.slice(start, end);
}

/** Python re.fullmatch(): the pattern must consume the entire string. */
export function fullmatch(source: string, flags: string, value: string): boolean {
  const re = new RegExp("^(?:" + source + ")$", flags.replace("g", ""));
  const m = re.exec(value);
  return m !== null && m[0].length === value.length;
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function exists(p: string): boolean {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Approximate CPython's OSError str() for messages that interpolate the exception. */
export function osErrorText(e: unknown, p: string): string {
  const err = e as NodeJS.ErrnoException;
  const errno = typeof err?.errno === "number" ? Math.abs(err.errno) : 0;
  const desc: Record<string, string> = {
    ENOENT: "No such file or directory",
    EISDIR: "Is a directory",
    EACCES: "Permission denied",
    ENOTDIR: "Not a directory",
    ELOOP: "Too many levels of symbolic links",
  };
  const code = err?.code ?? "";
  const text = desc[code] ?? err?.message ?? String(e);
  return `[Errno ${errno}] ${text}: '${p}'`;
}

/** Non-recursive Path.glob("*.md"), sorted the way CPython sorts Path objects. */
export function globMd(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.name.endsWith(".md"))
    .map((e) => path.join(dir, e.name))
    .sort(comparePaths);
}

/** Recursive Path.rglob("*.md"), sorted the way CPython sorts Path objects. */
export function rglobMd(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) out.push(full);
    }
  };
  walk(dir);
  return out.sort(comparePaths);
}

/** Path.glob("<ref>-*.md") against a directory, sorted like CPython. */
export function globPrefix(dir: string, prefix: string): string[] {
  if (!isDir(dir)) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.startsWith(prefix + "-") && name.endsWith(".md"))
    .map((name) => path.join(dir, name))
    .sort(comparePaths);
}
