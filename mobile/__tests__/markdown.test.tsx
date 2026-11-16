/**
 * MarkdownText 解析与渲染断言(FR-2)。
 * 纯函数断言(加粗/列表/表格/行内代码/纯文本/未知语法直出/混合样例)
 * + react-test-renderer 渲染断言。无第三方依赖,无需额外 jest.mock
 * (react-native-linear-gradient 已在 jest.setup.js mock 成 View,坑 #27)。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import MarkdownText, {
  parseBlocks,
  parseInline,
  type MarkdownBlock,
} from '../src/components/MarkdownText';

const COLORS = {
  text: '#14161F',
  surface: '#F1F3F9',
  border: '#E8EBF3',
};

const renderMarkdown = async (content: string) => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <MarkdownText
        content={content}
        color={COLORS.text}
        baseStyle={{ fontSize: 15, lineHeight: 22 }}
        surfaceColor={COLORS.surface}
        borderColor={COLORS.border}
      />,
    );
  });
  return tree as ReactTestRenderer.ReactTestRenderer;
};

type JsonNode = ReactTestRenderer.ReactTestRendererJSON;

/** 递归拼出渲染树里的全部文本(不含丢字)。 */
const flattenText = (node: JsonNode | JsonNode[] | null): string => {
  if (!node) {
    return '';
  }
  if (Array.isArray(node)) {
    return node.map((item) => flattenText(item)).join('');
  }
  return (node.children ?? [])
    .map((child) => (typeof child === 'string' ? child : flattenText(child)))
    .join('');
};

const textNodes = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text as never);

describe('parseInline', () => {
  it('加粗', () => {
    expect(parseInline('**加粗**正常')).toEqual([
      { type: 'bold', value: '加粗' },
      { type: 'text', value: '正常' },
    ]);
  });

  it('行内代码', () => {
    expect(parseInline('用 `cash` 支付')).toEqual([
      { type: 'text', value: '用 ' },
      { type: 'code', value: 'cash' },
      { type: 'text', value: ' 支付' },
    ]);
  });

  it('未闭合标记按纯文本直出', () => {
    expect(parseInline('**未闭合')).toEqual([{ type: 'text', value: '**未闭合' }]);
    expect(parseInline('`未闭合')).toEqual([{ type: 'text', value: '`未闭合' }]);
    expect(parseInline('*斜体*')).toEqual([{ type: 'text', value: '*斜体*' }]);
  });

  it('不丢字符:任意文本拼回与原文一致', () => {
    const source = 'a **b** `c` ** ` d*e|f';
    const joined = parseInline(source)
      .map((node) => (node.type === 'bold' ? `**${node.value}**` : node.type === 'code' ? `\`${node.value}\`` : node.value))
      .join('');
    expect(joined).toBe(source);
  });
});

describe('parseBlocks', () => {
  it('纯文本段落保留换行', () => {
    expect(parseBlocks('第一行\n第二行')).toEqual<MarkdownBlock[]>([
      {
        type: 'paragraph',
        lines: [[{ type: 'text', value: '第一行' }], [{ type: 'text', value: '第二行' }]],
      },
    ]);
  });

  it('无序列表(- 与 * 开头)', () => {
    expect(parseBlocks('- 牛奶\n* 面包')).toEqual<MarkdownBlock[]>([
      { type: 'listItem', inlines: [{ type: 'text', value: '牛奶' }] },
      { type: 'listItem', inlines: [{ type: 'text', value: '面包' }] },
    ]);
  });

  it('表格:表头 + 分隔行 + 数据行', () => {
    const blocks = parseBlocks('| 类别 | 金额 |\n| --- | --- |\n| 早餐 | 18 |');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual<MarkdownBlock>({
      type: 'table',
      header: [[{ type: 'text', value: '类别' }], [{ type: 'text', value: '金额' }]],
      rows: [
        [
          [{ type: 'text', value: '早餐' }],
          [{ type: 'text', value: '18' }],
        ],
      ],
    });
  });

  it('未知语法直出(标题/HTML/链接/斜体)', () => {
    const source = '# 标题\n<div>html</div>\n[链接](https://example.com)';
    const blocks = parseBlocks(source);
    expect(blocks).toEqual<MarkdownBlock[]>([
      {
        type: 'paragraph',
        lines: [
          [{ type: 'text', value: '# 标题' }],
          [{ type: 'text', value: '<div>html</div>' }],
          [{ type: 'text', value: '[链接](https://example.com)' }],
        ],
      },
    ]);
  });

  it('缺少分隔行的竖线文本按纯文本直出', () => {
    const blocks = parseBlocks('| 不是 | 表格 |');
    expect(blocks).toEqual<MarkdownBlock[]>([
      {
        type: 'paragraph',
        lines: [[{ type: 'text', value: '| 不是 | 表格 |' }]],
      },
    ]);
  });

  it('混合样例:段落/表格/列表/段落', () => {
    const source = [
      '本月餐饮 **1280 元**。',
      '',
      '| 类别 | 金额 |',
      '| --- | --- |',
      '| 早餐 | 18 |',
      '',
      '- 少点外卖',
      '- 多做饭',
      '',
      '用 `cash` 支付',
    ].join('\n');
    const blocks = parseBlocks(source);
    expect(blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'table',
      'listItem',
      'listItem',
      'paragraph',
    ]);
  });
});

describe('MarkdownText 渲染', () => {
  it('加粗渲染为粗体 Text', async () => {
    const tree = await renderMarkdown('这是 **加粗** 的');
    expect(flattenText(tree.toJSON())).toBe('这是 加粗 的');
    const bold = textNodes(tree).find((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.fontWeight === '700' && node.props.children === '加粗';
    });
    expect(bold).toBeDefined();
  });

  it('列表渲染 • 前缀', async () => {
    const tree = await renderMarkdown('- 牛奶\n- 面包');
    const text = flattenText(tree.toJSON());
    expect(text).toContain('• ');
    expect(text).toContain('牛奶');
    expect(text).toContain('面包');
  });

  it('表格渲染:横滑容器 + 表头 surface 底色 + border 描边', async () => {
    const tree = await renderMarkdown('| 类别 | 金额 |\n| --- | --- |\n| 早餐 | 18 |');
    const text = flattenText(tree.toJSON());
    expect(text).toContain('类别');
    expect(text).toContain('早餐');
    expect(text).toContain('18');

    const scroll = tree.root.findAllByType(ScrollView as never);
    expect(scroll).toHaveLength(1);
    expect(scroll[0].props.horizontal).toBe(true);

    const headerCells = tree.root
      .findAllByType(View as never)
      .filter((node) => {
        const style = StyleSheet.flatten(node.props.style);
        return style?.backgroundColor === COLORS.surface;
      });
    expect(headerCells).toHaveLength(2);

    const bordered = tree.root
      .findAllByType(View as never)
      .filter((node) => StyleSheet.flatten(node.props.style)?.borderColor === COLORS.border);
    expect(bordered.length).toBeGreaterThanOrEqual(4); // 2 表头格 + 2 数据格
  });

  it('行内代码渲染为等宽 Text', async () => {
    const tree = await renderMarkdown('用 `cash` 支付');
    expect(flattenText(tree.toJSON())).toBe('用 cash 支付');
    const code = textNodes(tree).find((node) => node.props.children === 'cash');
    expect(code).toBeDefined();
    const style = StyleSheet.flatten(code?.props.style ?? {});
    expect(style?.fontFamily).toBeDefined();
  });

  it('纯文本原样显示', async () => {
    const tree = await renderMarkdown('你好，世界');
    expect(flattenText(tree.toJSON())).toBe('你好，世界');
  });

  it('未知语法直出且不丢字符', async () => {
    const source = '# 标题\n[链接](https://example.com)\n**未闭合\n<div>x</div>';
    const tree = await renderMarkdown(source);
    expect(flattenText(tree.toJSON())).toBe(source);
  });

  it('混合样例渲染完整', async () => {
    const source = [
      '本月餐饮 **1280 元**。',
      '',
      '| 类别 | 金额 |',
      '| --- | --- |',
      '| 早餐 | 18 |',
      '',
      '- 少点外卖',
      '',
      '用 `cash` 支付',
    ].join('\n');
    const tree = await renderMarkdown(source);
    const text = flattenText(tree.toJSON());
    expect(text).toContain('本月餐饮 1280 元。');
    expect(text).toContain('类别');
    expect(text).toContain('18');
    expect(text).toContain('• 少点外卖');
    expect(text).toContain('用 cash 支付');
  });
});
