import { TextStyle } from 'react-native';

/** 文字样式规范。 */
export const typography = {
  /** 页面大标题。 */
  title: {
    fontSize: 26,
    fontWeight: '700',
  } as TextStyle,
  /** 卡片标题。 */
  heading: {
    fontSize: 18,
    fontWeight: '700',
  } as TextStyle,
  /** 正文。 */
  body: {
    fontSize: 15,
    fontWeight: '400',
  } as TextStyle,
  /** 强调数字/金额。 */
  amount: {
    fontSize: 20,
    fontWeight: '700',
  } as TextStyle,
  /** 辅助说明。 */
  caption: {
    fontSize: 12,
    fontWeight: '400',
  } as TextStyle,
  /** 按钮文字。 */
  button: {
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
} as const;
