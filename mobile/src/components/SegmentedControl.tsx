import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import GradientView from './GradientView';

export interface SegmentOption {
  key: string;
  label: string;
}

interface Props {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
}

/**
 * 分段选择器(我的/伴侣、预算/存钱等)。
 * 选中项为紫→粉渐变胶囊,符合「活力渐变」风格。
 */
export default function SegmentedControl({ options, value, onChange }: Props) {
  const colors = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            style={styles.option}
            onPress={() => onChange(option.key)}
          >
            {selected ? (
              <GradientView style={styles.active}>
                <Text style={styles.activeText}>{option.label}</Text>
              </GradientView>
            ) : null}
            <Text
              style={
                selected
                  ? styles.activeText
                  : [styles.inactiveText, { color: colors.textSecondary }]
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.fab,
    padding: 3,
  },
  option: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: radius.fab - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  inactiveText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
