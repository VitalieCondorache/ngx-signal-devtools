import type { SignalOrigin } from './types';

/** Frames that belong to the devtools itself or to Angular must not be reported as user code. */
const DEFAULT_IGNORED = [/ngx-signal-devtools/, /[\\/]node_modules[\\/]/, /[\\/]@angular[\\/]/];

/** Matches `at fn (file:line:col)`, `at new Class (file:line:col)` and `at file:line:col`. */
const FRAME_PATTERN = /at\s+(?:(.*?)\s+\()?([^()\s]+?):(\d+):(\d+)\)?\s*$/;

export interface ParseOriginOptions {
  /** Additional frame matchers to skip (substring or regular expression). */
  readonly ignore?: readonly (string | RegExp)[];
}

/**
 * Turns a raw stack trace into an origin. Purely functional so it can be unit tested with
 * synthetic stacks — the runtime never has to guess in tests.
 */
export function parseSignalOrigin(
  stack: string | undefined,
  options: ParseOriginOptions = {},
): SignalOrigin | null {
  if (!stack) {
    return null;
  }

  const ignored = [...DEFAULT_IGNORED, ...(options.ignore ?? [])];

  for (const rawLine of stack.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('at ')) {
      continue;
    }

    const match = FRAME_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const [, rawFunction, file, rawLineNumber, rawColumn] = match;
    if (ignored.some((pattern) => matches(file, pattern))) {
      continue;
    }

    const lineNumber = Number(rawLineNumber);
    const column = Number(rawColumn);
    if (!Number.isFinite(lineNumber) || !Number.isFinite(column)) {
      continue;
    }

    return {
      file,
      line: lineNumber,
      column,
      functionName: rawFunction?.trim() || null,
      label: `${shorten(file)}:${lineNumber}`,
    };
  }

  return null;
}

/**
 * Best-effort owner name: stack frames of class members look like `new TodosStore` or
 * `TodosStore.todos`, so a capitalized function name is a good hint about the enclosing class.
 */
export function ownerFromOrigin(origin: SignalOrigin | null): string | null {
  const fn = origin?.functionName;
  if (!fn) {
    return null;
  }
  const candidate = fn
    .replace(/^new\s+/, '')
    .split('.')[0]
    .replace(/^async\s+/, '');
  return /^[A-Z][\w$]*$/.test(candidate) ? candidate : null;
}

/** Captures the origin of the caller (one frame above the caller by default). */
export function captureSignalOrigin(
  options: ParseOriginOptions & { readonly skipFrames?: number } = {},
): SignalOrigin | null {
  const { skipFrames = 0, ...parseOptions } = options;
  let stack: string | undefined;
  try {
    stack = new Error('ngx-signal-devtools').stack;
  } catch {
    return null;
  }

  if (!stack) {
    return null;
  }

  if (skipFrames > 0) {
    const lines = stack.split('\n');
    const header = lines.slice(0, 1);
    const frames = lines.slice(1 + skipFrames);
    stack = [...header, ...frames].join('\n');
  }

  return parseSignalOrigin(stack, parseOptions);
}

function matches(file: string, pattern: string | RegExp): boolean {
  return typeof pattern === 'string' ? file.includes(pattern) : pattern.test(file);
}

function shorten(file: string): string {
  const cleaned = file.replace(/^webpack:\/\//, '').replace(/^https?:\/\/[^/]+/, '');
  const segments = cleaned.split(/[\\/]/).filter(Boolean);
  return segments.slice(-2).join('/');
}

/** Renders a short, safe preview of a value for the overlay. Never throws. */
export function previewValue(value: unknown, maxLength = 60): string | null {
  if (value === null || value === undefined) {
    return String(value);
  }

  try {
    const type = typeof value;
    if (type === 'string') {
      const text = value as string;
      return `"${text.length > maxLength ? `${text.slice(0, maxLength)}…` : text}"`;
    }
    if (type === 'number' || type === 'boolean' || type === 'bigint') {
      return String(value);
    }
    if (type === 'function') {
      return `ƒ ${(value as () => void).name || 'anonymous'}()`;
    }
    if (Array.isArray(value)) {
      // Avoid stringifying large collections on every recomputation.
      return value.length > 20
        ? `Array(${value.length})`
        : `[${value.map((item) => previewValue(item, 16)).join(', ')}]`;
    }
    if (type === 'object') {
      const name = (value as object).constructor?.name ?? 'Object';
      if (name === 'Date') {
        return (value as Date).toISOString();
      }
      if (name === 'Map' || name === 'Set') {
        return `${name}(${(value as Map<unknown, unknown>).size})`;
      }
      const keys = Object.keys(value as object);
      if (keys.length > 12 || name !== 'Object') {
        return `${name}{${keys.length} keys}`;
      }
      return truncate(JSON.stringify(value) ?? name);
    }
    return String(value);
  } catch {
    return null;
  }
}

function truncate(text: string, maxLength = 60): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
