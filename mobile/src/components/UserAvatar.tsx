import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme';
import { isImageUri } from '../utils/format';

interface Props {
  avatar?: string | null;
  size?: number;
}

/** 用户头像:data URI / http 地址用 Image 渲染,否则显示 emoji 占位。 */
export default function UserAvatar({ avatar, size = 44 }: Props) {
  const colors = useTheme();
  const roundStyle = { width: size, height: size, borderRadius: size / 2 };

  if (isImageUri(avatar)) {
    return <Image source={{ uri: avatar }} style={[styles.image, roundStyle]} />;
  }

  return (
    <View
      style={[
        styles.placeholder,
        roundStyle,
        { backgroundColor: colors.surface },
      ]}
    >
      <Text
        style={[
          styles.emoji,
          { fontSize: size * 0.5, lineHeight: size * 0.6 },
        ]}
      >
        👤
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emoji: {
    textAlign: 'center',
  },
});
