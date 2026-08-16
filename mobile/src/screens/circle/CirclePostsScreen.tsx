import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createPost, listCirclePosts, ratePost } from '../../api/circles';
import { extractErrorMessage } from '../../api/client';
import EmptyView from '../../components/EmptyView';
import ErrorView from '../../components/ErrorView';
import GradientButton from '../../components/GradientButton';
import GradientView from '../../components/GradientView';
import InputModal from '../../components/InputModal';
import LoadingView from '../../components/LoadingView';
import ScreenHeader from '../../components/ScreenHeader';
import UserAvatar from '../../components/UserAvatar';
import type { RootStackParamList } from '../../navigation/types';
import { radius, spacing, typography, useTheme } from '../../theme';
import type { CirclePost } from '../../types';
import { formatDateTime, formatScore } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'CirclePosts'>;

const PAGE_SIZE = 20;

/** 圈子帖子动态列表(FR-08):帖子卡片 + 发帖(FAB)+ 评分 + 进入详情评论。 */
export default function CirclePostsScreen({ navigation, route }: Props) {
  const colors = useTheme();
  const { circleId, circleName } = route.params;

  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [postModalVisible, setPostModalVisible] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [posting, setPosting] = useState(false);

  const [ratingPost, setRatingPost] = useState<CirclePost | null>(null);
  const [ratingScore, setRatingScore] = useState('');
  const [ratingSending, setRatingSending] = useState(false);

  const loadPosts = useCallback(
    async (targetPage = 1, append = false) => {
      if (targetPage === 1) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const result = await listCirclePosts(circleId, targetPage, PAGE_SIZE);
        setPosts((prev) => (append ? [...prev, ...result.items] : result.items));
        setPage(result.page);
        setHasMore(result.has_more);
      } catch (e) {
        if (targetPage === 1) {
          setError(extractErrorMessage(e));
        } else {
          Alert.alert('加载失败', extractErrorMessage(e));
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [circleId],
  );

  useEffect(() => {
    void loadPosts(1, false);
  }, [loadPosts]);

  const submitPost = async () => {
    const content = postContent.trim();
    if (!content) {
      Alert.alert('提示', '内容不能为空');
      return;
    }
    setPosting(true);
    try {
      await createPost(circleId, { content });
      setPostModalVisible(false);
      setPostContent('');
      Alert.alert('发布成功');
      await loadPosts(1, false);
    } catch (e) {
      Alert.alert('发布失败', extractErrorMessage(e));
    } finally {
      setPosting(false);
    }
  };

  const pickPostImage = () => {
    // TODO(FR-08): 接入图片选择器(react-native-image-picker)后,将图片转为
    // base64(data:image/...;base64,...) 传入 createPost 的 image 字段(≤600000 字符)。
    Alert.alert('暂未支持', '发帖配图需先接入图片选择器,敬请期待。');
  };

  const submitRating = async () => {
    if (!ratingPost) {
      return;
    }
    const score = Number(ratingScore);
    if (!ratingScore.trim() || Number.isNaN(score) || score < 0 || score > 10) {
      Alert.alert('提示', '请输入 0-10 之间的分数');
      return;
    }
    setRatingSending(true);
    try {
      await ratePost(ratingPost.id, score);
      setRatingPost(null);
      setRatingScore('');
      Alert.alert('打分成功');
      await loadPosts(1, false);
    } catch (e) {
      Alert.alert('打分失败', extractErrorMessage(e));
    } finally {
      setRatingSending(false);
    }
  };

  const openDetail = (post: CirclePost) => {
    navigation.navigate('CirclePostDetail', { circleId, post });
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScreenHeader title={circleName} onBack={() => navigation.goBack()} />

      {loading ? (
        <LoadingView text="加载动态…" />
      ) : error ? (
        <ErrorView message={error} onRetry={() => void loadPosts(1, false)} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onRate={() => {
                setRatingPost(item);
                setRatingScore(item.my_score != null ? String(item.my_score) : '');
              }}
              onComment={() => openDetail(item)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            posts.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={
            <EmptyView
              emoji="📭"
              title="还没有帖子"
              description="点右下角 + 发一条动态吧"
            />
          }
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            if (hasMore && !loadingMore) {
              void loadPosts(page + 1, true);
            }
          }}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footer} color={colors.primary} />
            ) : undefined
          }
          refreshing={loading}
          onRefresh={() => void loadPosts(1, false)}
        />
      )}

      {/* 发帖 FAB */}
      <Pressable onPress={() => setPostModalVisible(true)} style={styles.fab}>
        <GradientView style={styles.fabGradient}>
          <Text style={styles.fabText}>＋</Text>
        </GradientView>
      </Pressable>

      {/* 发帖弹窗 */}
      <Modal
        visible={postModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPostModalVisible(false)}
      >
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              发布动态
            </Text>
            <TextInput
              style={[
                styles.postInput,
                { backgroundColor: colors.surface, color: colors.textPrimary },
              ]}
              placeholder="分享点什么…(最多 200 字)"
              placeholderTextColor={colors.textTertiary}
              value={postContent}
              onChangeText={setPostContent}
              multiline
              maxLength={200}
            />
            <Pressable
              onPress={pickPostImage}
              style={[styles.imageButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.imageButtonText, { color: colors.textSecondary }]}>
                📷 添加图片(待接入)
              </Text>
            </Pressable>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setPostModalVisible(false)}
                style={[styles.cancelButton, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                  取消
                </Text>
              </Pressable>
              <GradientButton
                title="发布"
                onPress={() => void submitPost()}
                disabled={posting}
                style={styles.confirmButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* 评分弹窗 */}
      <InputModal
        visible={ratingPost !== null}
        title={ratingPost ? `给「${ratingPost.user.nickname}」的帖子评分` : ''}
        fields={[
          {
            key: 'score',
            placeholder: '输入 0-10 分',
            value: ratingScore,
            onChangeText: setRatingScore,
            keyboardType: 'numeric',
            maxLength: 4,
          },
        ]}
        confirmText="提交评分"
        loading={ratingSending}
        onConfirm={() => void submitRating()}
        onCancel={() => {
          setRatingPost(null);
          setRatingScore('');
        }}
      />
    </SafeAreaView>
  );
}

function PostCard({
  post,
  onRate,
  onComment,
}: {
  post: CirclePost;
  onRate: () => void;
  onComment: () => void;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.postHeader}>
        <UserAvatar avatar={post.user.avatar} size={40} />
        <View style={styles.postHeaderText}>
          <Text style={[styles.postAuthor, { color: colors.textPrimary }]}>
            {post.user.nickname}
          </Text>
          <Text style={[styles.postTime, { color: colors.textTertiary }]}>
            {formatDateTime(post.created_at)}
          </Text>
        </View>
      </View>

      {post.content ? (
        <Text style={[styles.postContent, { color: colors.textPrimary }]}>
          {post.content}
        </Text>
      ) : null}
      {post.image ? (
        <Image source={{ uri: post.image }} style={styles.postImage} resizeMode="cover" />
      ) : null}

      <View style={styles.scoreRow}>
        <Text style={[styles.scoreText, { color: colors.textSecondary }]}>
          ⭐ {formatScore(post.average_score)} · {post.rating_count} 人评分
          {post.my_score != null ? ` · 我的评分 ${formatScore(post.my_score)}` : ''}
        </Text>
        <Text style={[styles.scoreText, { color: colors.textSecondary }]}>
          💬 {post.comment_count} 条评论
        </Text>
      </View>

      {post.comments_preview.length > 0 ? (
        <View style={[styles.previewWrap, { backgroundColor: colors.surface }]}>
          {post.comments_preview.slice(0, 2).map((comment) => (
            <Text
              key={comment.id}
              style={[styles.previewLine, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              <Text style={[styles.previewAuthor, { color: colors.textPrimary }]}>
                {comment.user.nickname}:
              </Text>{' '}
              {comment.content}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.postActions}>
        <Pressable
          onPress={onRate}
          style={[styles.postActionButton, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.postActionText, { color: colors.primary }]}>
            {post.my_score != null ? '重新评分' : '评分'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onComment}
          style={[styles.postActionButton, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.postActionText, { color: colors.primary }]}>
            评论 · 查看详情
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 96,
    gap: spacing.lg,
  },
  listEmpty: {
    flexGrow: 1,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  postHeaderText: {
    flex: 1,
    gap: 2,
  },
  postAuthor: {
    ...typography.body,
    fontWeight: '600',
  },
  postTime: {
    ...typography.caption,
  },
  postContent: {
    ...typography.body,
    lineHeight: 22,
  },
  postImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: '#EEEEEE',
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  scoreText: {
    ...typography.caption,
  },
  previewWrap: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  previewLine: {
    ...typography.caption,
    lineHeight: 18,
  },
  previewAuthor: {
    fontWeight: '600',
  },
  postActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  postActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  postActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    borderRadius: radius.fab,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: radius.fab,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 34,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  modalTitle: {
    ...typography.heading,
    marginBottom: spacing.lg,
  },
  postInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 100,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  imageButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: spacing.md,
  },
  imageButtonText: {
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
  },
  cancelText: {
    ...typography.button,
  },
  confirmButton: {
    flex: 1,
  },
});
