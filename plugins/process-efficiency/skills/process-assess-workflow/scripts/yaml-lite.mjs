#!/usr/bin/env node
// 最小 YAML 解析器（仅覆盖本插件契约结构：map / seq / 嵌套 / 标量 / 行内与行尾注释 / 引号）。
// 零依赖：插件无 package.json，不引入 js-yaml 等。供 validate-findings.mjs 与 aggregate-findings.mjs 共用。
function stripComment(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) return line.slice(0, i);
    if (inS || inD) continue;
  }
  return line;
}

function findColon(s) {
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === ':' && !inS && !inD) return i;
  }
  return -1;
}

function parseScalar(v) {
  if (v === '' || v === '~' || v === 'null') return null;
  if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function isMapStart(s) {
  const c = findColon(s);
  return c > 0 && (c + 1 === s.length || s[c + 1] === ' ');
}

function parseBlock(lines, start, indent) {
  const first = lines[start];
  if (first.content.startsWith('- ')) {
    const seq = [];
    let i = start;
    while (i < lines.length && lines[i].indent === first.indent && lines[i].content.startsWith('- ')) {
      const item = lines[i].content.slice(2);
      if (item === '') {
        const sub = parseBlock(lines, i + 1, lines[i + 1].indent);
        seq.push(sub.value);
        i = sub.next;
      } else if (isMapStart(item)) {
        const res = parseSeqItemMap(lines, i, first.indent);
        seq.push(res.value);
        i = res.next;
      } else {
        seq.push(parseScalar(item));
        i++;
      }
    }
    return { value: seq, next: i };
  }
  const map = {};
  let i = start;
  while (i < lines.length && lines[i].indent === first.indent && !lines[i].content.startsWith('- ')) {
    const c = lines[i].content;
    const col = findColon(c);
    const key = c.slice(0, col).trim();
    const rest = c.slice(col + 1).trim();
    if (rest === '') {
      if (i + 1 < lines.length && lines[i + 1].indent > first.indent) {
        const sub = parseBlock(lines, i + 1, lines[i + 1].indent);
        map[key] = sub.value;
        i = sub.next;
      } else {
        map[key] = null;
        i++;
      }
    } else {
      map[key] = parseScalar(rest);
      i++;
    }
  }
  return { value: map, next: i };
}

function parseSeqItemMap(lines, i, dashIndent) {
  const item = lines[i].content.slice(2);
  const childIndent = dashIndent + 2;
  const map = {};
  const col = findColon(item);
  const k = item.slice(0, col).trim();
  const v = item.slice(col + 1).trim();
  let idx = i;
  if (v === '') {
    if (idx + 1 < lines.length && lines[idx + 1].indent > dashIndent) {
      const sub = parseBlock(lines, idx + 1, lines[idx + 1].indent);
      map[k] = sub.value;
      idx = sub.next;
    } else {
      map[k] = null;
      idx = idx + 1;
    }
  } else {
    map[k] = parseScalar(v);
    idx = idx + 1;
  }
  while (idx < lines.length && lines[idx].indent === childIndent && !lines[idx].content.startsWith('- ')) {
    const c = lines[idx].content;
    const cc = findColon(c);
    const kk = c.slice(0, cc).trim();
    const vv = c.slice(cc + 1).trim();
    if (vv === '') {
      if (idx + 1 < lines.length && lines[idx + 1].indent > childIndent) {
        const sub = parseBlock(lines, idx + 1, lines[idx + 1].indent);
        map[kk] = sub.value;
        idx = sub.next;
      } else {
        map[kk] = null;
        idx = idx + 1;
      }
    } else {
      map[kk] = parseScalar(vv);
      idx = idx + 1;
    }
  }
  return { value: map, next: idx };
}

export function parseYaml(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const stripped = stripComment(raw);
    if (stripped.trim() === '') continue;
    const indent = stripped.length - stripped.trimStart().length;
    lines.push({ indent, content: stripped.trimStart() });
  }
  if (lines.length === 0) return {};
  return parseBlock(lines, 0, 0).value;
}
