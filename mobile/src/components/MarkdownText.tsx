/**
 * MarkdownText:小光回答的轻量 Markdown 渲染(FR-2)。
 *
 * 纯 RN、零第三方依赖。支持:加粗 **x**、无序列表(- / * 开头)、
 * 表格(| a | b | 行 + |---| 分隔行)、行内代码 `x`、段落/换行。
 * 不渲染图片/HTML/链接跳转;任何未识别语法按纯文本原样直出(不丢字符)。
 * 全部颜色经 props 传入(皮肤 token),StyleSheet 不写死色值。
 */
import React, { useMemo } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';

/** 行内节点:纯文本 / 粗体 / 行内代码。 */
export type MarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string };

/** 块级节点:段落 / 列表项 / 表格。 */
export type MarkdownBlock =
  | { type: 'paragraph'; lines: MarkdownInline[][] }
  | { type: 'listItem'; inlines: MarkdownInline[] }
  | { type: 'table'; header: MarkdownInline[][]; rows: MarkdownInline[][][] };

export interface MarkdownTextProps {
  /** 原始 Markdown 文本。 */
  content: string;
  /** 正文颜色(皮肤 token,如 colors.textPrimary)。 */
  color: string;
  /** 基础文本样式(字号/行高等),粗体与行内代码在其上叠加。 */
  baseStyle?: TextStyle;
  /** 表头底色与行内代码底色(皮肤 token colors.surface)。 */
  surfaceColor?: string;
  /** 表格描边色(皮肤 token colors.border)。 */
  borderColor?: string;
}

const LIST_ITEM_RE = /^[-*]\s+/;
const SEPARATOR_CELL_RE = /^:?-+:?$/;

/** 行内解析:**加粗** 与 `行内代码`;未识别/未闭合标记按纯文本直出。 */
export function parseInline(text: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let plain = '';
  const flushPlain = () => {
    if (plain) {
      nodes.push({ type: 'text', value: plain });
      plain = '';
    }
  };

  let i = 0;
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const close = text.indexOf('**', i + 2);
      if (close > i + 2) {
        flushPlain();
        nodes.push({ type: 'bold', value: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
      // 未闭合的 **:原样直出
      plain += '**';
      i += 2;
      continue;
    }
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close > i + 1) {
        flushPlain();
        nodes.push({ type: 'code', value: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
      // 未闭合的 `:原样直出
      plain += '`';
      i += 1;
      continue;
    }
    plain += text[i];
    i += 1;
  }
  flushPlain();
  return nodes;
}

/** 拆出表格行的原始单元格文本(去首尾竖线)。 */
function splitRowCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) {
    s = s.slice(1);
  }
  if (s.endsWith('|')) {
    s = s.slice(0, -1);
  }
  return s.split('|');
}

/** 表格行 → 单元格行内节点。 */
function parseTableRow(line: string): MarkdownInline[][] {
  return splitRowCells(line).map((cell) => parseInline(cell.trim()));
}

/** 是否为表格分隔行(|---| / |:---:| 等)。 */
function isSeparatorRow(line: string): boolean {
  const cells = splitRowCells(line);
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL_RE.test(cell.trim()));
}

/**
 * 块级解析:逐行扫描 → 段落 / 列表项 / 表格块。
 * 未识别语法(标题、HTML、链接、斜体等)按纯文本进段落,不丢字符。
 */
export function parseBlocks(content: string): MarkdownBlock[] {
  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行:段落分隔
    if (!trimmed) {
      i += 1;
      continue;
    }

    // 列表项:- / * 开头(标记后须有空白)
    const listMatch = LIST_ITEM_RE.exec(trimmed);
    if (listMatch) {
      blocks.push({ type: 'listItem', inlines: parseInline(trimmed.slice(listMatch[0].length)) });
      i += 1;
      continue;
    }

    // 表格块:连续以 | 开头的行,第 2 行须为 |---| 分隔行,否则整段按纯文本直出
    if (trimmed.startsWith('|')) {
      let j = i;
      while (j < lines.length && lines[j].trim() !== '' && lines[j].trim().startsWith('|')) {
        j += 1;
      }
      const run = lines.slice(i, j);
      if (run.length >= 2 && isSeparatorRow(run[1])) {
        blocks.push({
          type: 'table',
          header: parseTableRow(run[0]),
          rows: run.slice(2).map((row) => parseTableRow(row)),
        });
      } else {
        blocks.push({ type: 'paragraph', lines: run.map((row) => parseInline(row)) });
      }
      i = j;
      continue;
    }

    // 段落:连续普通行,行间保留换行
    const paraLines: MarkdownInline[][] = [];
    while (i < lines.length) {
      const paraLine = lines[i];
      const paraTrimmed = paraLine.trim();
      if (!paraTrimmed || LIST_ITEM_RE.test(paraTrimmed) || paraTrimmed.startsWith('|')) {
        break;
      }
      paraLines.push(parseInline(paraLine));
      i += 1;
    }
    blocks.push({ type: 'paragraph', lines: paraLines });
  }

  return blocks;
}

/** 渲染一行/一格的行内节点(粗体、行内代码为嵌套 Text)。 */
function renderInlines(
  inlines: MarkdownInline[],
  keyPrefix: string,
  color: string,
  surfaceColor: string | undefined,
  borderColor: string | undefined,
): React.ReactNode[] {
  return inlines.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'bold') {
      return (
        <Text key={key} style={styles.bold}>
          {node.value}
        </Text>
      );
    }
    if (node.type === 'code') {
      return (
        <Text
          key={key}
          style={[styles.inlineCode, { backgroundColor: surfaceColor, borderColor }]}
        >
          {node.value}
        </Text>
      );
    }
    return <Text key={key}>{node.value}</Text>;
  });
}

/** 轻量 Markdown 渲染组件(FR-2)。 */
export default function MarkdownText({
  content,
  color,
  baseStyle,
  surfaceColor,
  borderColor,
}: MarkdownTextProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <View>
      {blocks.map((block, index) => {
        const key = `md-block-${index}`;

        if (block.type === 'listItem') {
          return (
            <View key={key} style={styles.listRow}>
              <Text style={[baseStyle, { color }]}>• </Text>
              <Text style={[baseStyle, { color }]}>
                {renderInlines(block.inlines, key, color, surfaceColor, borderColor)}
              </Text>
            </View>
          );
        }

        if (block.type === 'table') {
          return (
            <ScrollView
              key={key}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tableScroll}
            >
              <View>
                <View style={styles.tableRow}>
                  {block.header.map((cell, cellIndex) => (
                    <View
                      key={`${key}-th-${cellIndex}`}
                      style={[
                        styles.tableCell,
                        { backgroundColor: surfaceColor, borderColor },
                      ]}
                    >
                      <Text style={[baseStyle, styles.tableHeaderText, { color }]}>
                        {renderInlines(
                          cell,
                          `${key}-th-${cellIndex}`,
                          color,
                          surfaceColor,
                          borderColor,
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
                {block.rows.map((row, rowIndex) => (
                  <View key={`${key}-tr-${rowIndex}`} style={styles.tableRow}>
                    {row.map((cell, cellIndex) => (
                      <View
                        key={`${key}-td-${rowIndex}-${cellIndex}`}
                        style={[styles.tableCell, { borderColor }]}
                      >
                        <Text style={[baseStyle, { color }]}>
                          {renderInlines(
                            cell,
                            `${key}-td-${rowIndex}-${cellIndex}`,
                            color,
                            surfaceColor,
                            borderColor,
                          )}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }

        // 段落:行内样式 + 换行
        return (
          <Text key={key} style={[baseStyle, { color }]}>
            {block.lines.map((line, lineIndex) => (
              <Text key={`${key}-line-${lineIndex}`}>
                {lineIndex > 0 ? '\n' : ''}
                {renderInlines(line, `${key}-line-${lineIndex}`, color, surfaceColor, borderColor)}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bold: {
    fontWeight: '700',
  },
  inlineCode: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tableScroll: {
    marginVertical: 4,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    minWidth: 88,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tableHeaderText: {
    fontWeight: '600',
  },
});
