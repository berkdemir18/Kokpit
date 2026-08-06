/**
 * Küçük sözdizimi renklendirici — komut defteri ve not önizlemesi için.
 * Harici bağımlılık yok; VS Code "Dark+" temasına yakın renkler kullanılır
 * (renkler styles/tokens.css'te --code-* değişkenlerinden gelir).
 *
 * Tam bir ayrıştırıcı değil: yorum / metin / sayı / anahtar kelime / değişken /
 * fonksiyon çağrısı ayrımı yapan sözcüksel bir tarayıcı. Yanlış boyanan bir
 * token en fazla renk hatasıdır, çıktıyı bozmaz.
 */

import { escapeHtml } from './util';

export type TokenKind =
  | 'comment' | 'string' | 'number' | 'keyword' | 'builtin'
  | 'variable' | 'function' | 'operator' | 'flag' | 'plain';

interface LangSpec {
  /** Görünen ad. */
  label: string;
  keywords: string[];
  builtins: string[];
  /** Satır yorumu başlangıçları. */
  lineComment: string[];
  /** Blok yorumu [başlangıç, bitiş]. */
  blockComment?: [string, string];
  /** `$VAR`, `%VAR%` gibi değişken deseni. */
  variable?: RegExp;
  /** `-v`, `--verbose` gibi bayraklar (kabuk dilleri). */
  flags?: boolean;
}

const SHELL: LangSpec = {
  label: 'bash',
  keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'in', 'function', 'return', 'export', 'local', 'source', 'sudo', 'set', 'unset', 'break', 'continue'],
  builtins: ['echo', 'cd', 'ls', 'cat', 'grep', 'awk', 'sed', 'curl', 'wget', 'chmod', 'chown', 'find', 'ssh', 'scp', 'tar', 'kill', 'ps', 'nmap', 'netcat', 'nc', 'hydra', 'john', 'hashcat', 'gobuster', 'ffuf', 'nikto', 'sqlmap', 'tcpdump', 'wireshark', 'openssl', 'python', 'python3', 'apt', 'git', 'docker', 'systemctl', 'ip', 'ifconfig', 'ping', 'dig', 'whois', 'mkdir', 'rm', 'cp', 'mv', 'head', 'tail', 'sort', 'uniq', 'wc', 'xxd', 'strings', 'file'],
  lineComment: ['#'],
  variable: /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\$[0-9@?*#]/,
  flags: true,
};

const PYTHON: LangSpec = {
  label: 'python',
  keywords: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'lambda', 'yield', 'pass', 'break', 'continue', 'global', 'nonlocal', 'assert', 'async', 'await', 'del', 'is', 'None', 'True', 'False', 'self'],
  builtins: ['print', 'len', 'range', 'open', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'sorted', 'type', 'isinstance', 'input', 'format', 'bytes'],
  lineComment: ['#'],
};

const JSLIKE: LangSpec = {
  label: 'javascript',
  keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'import', 'from', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'this', 'null', 'undefined', 'true', 'false', 'interface', 'type', 'enum', 'implements', 'public', 'private', 'readonly'],
  builtins: ['console', 'document', 'window', 'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Promise', 'Map', 'Set', 'fetch', 'setTimeout', 'setInterval', 'require', 'module'],
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
};

const POWERSHELL: LangSpec = {
  label: 'powershell',
  keywords: ['if', 'else', 'elseif', 'foreach', 'for', 'while', 'do', 'switch', 'function', 'param', 'return', 'try', 'catch', 'finally', 'throw', 'begin', 'process', 'end', 'filter', 'in'],
  builtins: ['Get-ChildItem', 'Get-Content', 'Set-Content', 'Get-Process', 'Stop-Process', 'Get-Service', 'Invoke-WebRequest', 'Invoke-Expression', 'New-Item', 'Remove-Item', 'Select-Object', 'Where-Object', 'ForEach-Object', 'Write-Host', 'Write-Output', 'Test-Path', 'Get-Command', 'Start-Process'],
  lineComment: ['#'],
  variable: /\$[A-Za-z_][A-Za-z0-9_]*/,
  flags: true,
};

const SQL: LangSpec = {
  label: 'sql',
  keywords: ['select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'drop', 'alter', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'having', 'limit', 'union', 'and', 'or', 'not', 'null', 'as', 'distinct', 'index', 'primary', 'key', 'foreign', 'references'],
  builtins: ['count', 'sum', 'avg', 'min', 'max', 'now', 'coalesce', 'cast', 'concat', 'substring'],
  lineComment: ['--'],
  blockComment: ['/*', '*/'],
};

const JSON_SPEC: LangSpec = {
  label: 'json',
  keywords: ['true', 'false', 'null'],
  builtins: [],
  lineComment: [],
};

const PLAIN: LangSpec = { label: 'metin', keywords: [], builtins: [], lineComment: [] };

const LANGS: Record<string, LangSpec> = {
  bash: SHELL, sh: SHELL, shell: SHELL, zsh: SHELL, console: SHELL, terminal: SHELL, cmd: SHELL,
  python: PYTHON, py: PYTHON,
  javascript: JSLIKE, js: JSLIKE, typescript: JSLIKE, ts: JSLIKE, tsx: JSLIKE, jsx: JSLIKE, java: JSLIKE, c: JSLIKE, cpp: JSLIKE, rust: JSLIKE, go: JSLIKE,
  powershell: POWERSHELL, ps1: POWERSHELL, pwsh: POWERSHELL,
  sql: SQL,
  json: JSON_SPEC,
};

/** Komut defterinde seçilebilecek diller. */
export const LANGUAGES: string[] = [
  'bash', 'powershell', 'python', 'javascript', 'typescript', 'sql', 'json', 'metin',
];

export function langSpec(name: string): LangSpec {
  return LANGS[name.trim().toLowerCase()] ?? PLAIN;
}

interface Token { kind: TokenKind; text: string; }

/** Metni token'lara böler. Test edilebilir olsun diye HTML'den ayrı tutuldu. */
export function tokenize(code: string, language: string): Token[] {
  const spec = langSpec(language);
  const tokens: Token[] = [];
  const push = (kind: TokenKind, text: string) => { if (text) tokens.push({ kind, text }); };

  let i = 0;
  let plain = '';
  const flushPlain = () => { push('plain', plain); plain = ''; };

  const isWordChar = (c: string) => /[A-Za-z0-9_\-]/.test(c);

  while (i < code.length) {
    const rest = code.slice(i);
    const ch = code[i];

    // blok yorumu
    if (spec.blockComment && rest.startsWith(spec.blockComment[0])) {
      const end = code.indexOf(spec.blockComment[1], i + spec.blockComment[0].length);
      const stop = end < 0 ? code.length : end + spec.blockComment[1].length;
      flushPlain();
      push('comment', code.slice(i, stop));
      i = stop;
      continue;
    }

    // satır yorumu
    const lc = spec.lineComment.find((p) => rest.startsWith(p));
    if (lc) {
      const nl = code.indexOf('\n', i);
      const stop = nl < 0 ? code.length : nl;
      flushPlain();
      push('comment', code.slice(i, stop));
      i = stop;
      continue;
    }

    // metin ("…", '…', `…`)
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === ch) { j++; break; }
        if (code[j] === '\n' && ch !== '`') { break; }
        j++;
      }
      flushPlain();
      push('string', code.slice(i, j));
      i = j;
      continue;
    }

    // değişken
    if (spec.variable) {
      const m = rest.match(spec.variable);
      if (m && m.index === 0) {
        flushPlain();
        push('variable', m[0]);
        i += m[0].length;
        continue;
      }
    }

    // bayrak (-v / --verbose) — yalnız boşluktan sonra
    if (spec.flags && ch === '-' && (i === 0 || /\s/.test(code[i - 1]))) {
      const m = rest.match(/^--?[A-Za-z][A-Za-z0-9-]*/);
      if (m) {
        flushPlain();
        push('flag', m[0]);
        i += m[0].length;
        continue;
      }
    }

    // sayı
    if (/[0-9]/.test(ch) && (i === 0 || !isWordChar(code[i - 1]))) {
      const m = rest.match(/^0[xX][0-9a-fA-F]+|^\d+(\.\d+)?/);
      if (m) {
        flushPlain();
        push('number', m[0]);
        i += m[0].length;
        continue;
      }
    }

    // kelime
    if (/[A-Za-z_]/.test(ch)) {
      const m = rest.match(/^[A-Za-z_][A-Za-z0-9_-]*/);
      const word = m ? m[0] : ch;
      const lower = word.toLowerCase();
      const isKw = spec.keywords.some((k) => k.toLowerCase() === lower);
      const isBuiltin = spec.builtins.some((k) => k.toLowerCase() === lower);
      const nextCh = code[i + word.length];
      flushPlain();
      if (isKw) push('keyword', word);
      else if (isBuiltin) push('builtin', word);
      else if (nextCh === '(') push('function', word);
      else plain += word;
      i += word.length;
      continue;
    }

    // operatör / noktalama
    if (/[+\-*/%=<>!&|^~?:;,.(){}\[\]]/.test(ch)) {
      flushPlain();
      push('operator', ch);
      i++;
      continue;
    }

    plain += ch;
    i++;
  }
  flushPlain();
  return tokens;
}

/** Token'ları renkli HTML'e çevirir (metin kaçırılarak). */
export function highlight(code: string, language: string): string {
  return tokenize(code, language)
    .map((t) => (t.kind === 'plain' ? escapeHtml(t.text) : `<span class="tk tk--${t.kind}">${escapeHtml(t.text)}</span>`))
    .join('');
}
