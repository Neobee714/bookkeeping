import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createPostComment,
  deleteComment,
  deletePost,
  listCirclePosts,
  listPostComments,
  ratePost,
} from '../../api/circles';
import { extractErrorMessage } from '../../api/client';
import ConfirmModal from '../../components/ConfirmModal';
import EmptyView from '../../components/EmptyView';
import ErrorView from '../../components/ErrorView';
import GradientButton from '../../components/GradientButton';
import InputModal from '../../components/InputModal';
import LoadingView from '../../components/LoadingView';
import ScreenHeader from '../../components/ScreenHeader';
import UserAvatar from '../../components/UserAvatar';
import type { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { radius, spacing, typography, useTheme } from '../../theme';
import type { CircleComment, CirclePost } from '../../types';
import { formatDateTime, formatScore } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'CirclePostDetail'>;

/** 帖子详情 + 评论(FR-08):评论列表、发评论、删除自己的评论/帖子、评分。 */
export default function CirclePostDetailScreen({ navigation, route }: Props) {
  const colors = useTheme();
  const { circleId, post: initialPost } = route.params;
  const postId = initialPost.id;
  const currentUser = useAuthStore((s) => s.user);

  const [post, setPost] = useState<CirclePost>(initialPost);
  const [comments, setComments] = useState<CircleComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  const [commentInput, setCommentInput] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const [ratingPost, setRatingPost] = useState<CirclePost | null>(null);
  const [ratingScore, setRatingScore] = useState('');
  const [ratingSending, setRatingSending] = useState(false);

  const [deleteCommentTarget, setDeleteCommentTarget] =
    useState<CircleComment | null>(null);

  const [deletePostVisible, setDeletePostVisible] = useState(false);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      setComments(await listPostComments(postId));
    } catch (e) {
      setCommentsError(extractErrorMessage(e));
    } finally {
      setCommentsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  /** 评分/删除后重新拉取帖子聚合数据(平均分/评分人数)。 */
  const refreshPost = async () => {
    try {
      const result = await listCirclePosts(circleId, 1, 100);
      const found = result.items.find((item) => item.id === postId);
      if (found) {
        setPost(found);
      }
    } catch {
      // 刷新失败沿用现有数据
    }
  };

  const sendComment = async () => {
    const content = commentInput.trim();
    if (!content) {
      Alert.alert('提示', '评论内容不能为空');
      return;
    }
    setSendingComment(true);
    try {
      const comment = await createPostComment(postId, content);
      setComments((prev) => [...prev, comment]);
      setCommentInput('');
      setPost((prev) => ({ ...prev, comment_count: prev.comment_count + 1 }));
    } catch (e) {
      Alert.alert('评论失败', extractErrorMessage(e));
    } finally {
      setSendingComment(false);
    }
  };

  const confirmDeleteComment = async () => {
    if (!deleteCommentTarget) {
      return;
    }
    try {
      await deleteComment(deleteCommentTarget.id);
      setComments((prev) => prev.filter((c) => c.id !== deleteCommentTarget.id));
      setPost((prev) => ({
        ...prev,
        comment_count: Math.max(0, prev.comment_count - 1),
      }));
      setDeleteCommentTarget(null);
    } catch (e) {
      Alert.alert('删除失败', extractErrorMessage(e));
    }
  };

  const confirmDeletePost = async () => {
    try {
      await deletePost(circleId, postId);
      navigation.goBack();
    } catch (e) {
      Alert.alert('删除失败', extractErrorMessage(e));
    }
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
      await refreshPost();
    } catch (e) {
      Alert.alert('打分失败', extractErrorMessage(e));
    } finally {
      setRatingSending(false);
    }
  };

  const isMine = post.user.id === currentUser?.id;

  const postCard = (
    <View style={[styles.postCard, { backgroundColor: colors.card }]}>
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
      </View>

      <Pressable
        onPress={() => {
          setRatingPost(post);
          setRatingScore(post.my_score != null ? String(post.my_score) : '');
        }}
        style={[styles.rateButton, { backgroundColor: colors.surface }]}
      >
        <Text style={[styles.rateButtonText, { color: colors.primary }]}>
          {post.my_score != null ? '重新评分' : '评分'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScreenHeader
        title="帖子详情"
        onBack={() => navigation.goBack()}
        right={
          isMine ? (
            <Pressable onPress={() => setDeletePostVisible(true)} hitSlop={8}>
              <Text style={[styles.deletePostText, { color: colors.expense }]}>
                删除
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      <FlatList
        data={comments}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <CommentRow
            comment={item}
            isMine={item.user.id === currentUser?.id}
            onDelete={() => setDeleteCommentTarget(item)}
          />
        )}
        ListHeaderComponent={postCard}
        ListEmptyComponent={
          commentsLoading ? (
            <LoadingView text="加载评论…" />
          ) : commentsError ? (
            <ErrorView
              message={commentsError}
              onRetry={() => void loadComments()}
            />
          ) : (
            <EmptyView
              emoji="💬"
              title="还没有评论"
              description="来抢沙发,说点什么吧"
            />
          )
        }
        contentContainerStyle={[styles.listContent, comments.length === 0 && styles.listEmpty]}
      />

      {/* 底部评论输入栏 */}
      <View
        style={[
          styles.commentBar,
          { backgroundColor: colors.card, borderTopColor: colors.border },
        ]}
      >
        <TextInput
          style={[
            styles.commentInput,
            { backgroundColor: colors.surface, color: colors.textPrimary },
          ]}
          placeholder="说点什么…"
          placeholderTextColor={colors.textTertiary}
          value={commentInput}
          onChangeText={setCommentInput}
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={() => void sendComment()}
        />
        <GradientButton
          title="发送"
          onPress={() => void sendComment()}
          disabled={sendingComment}
          style={styles.sendButton}
        />
      </View>

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

      <ConfirmModal
        visible={deleteCommentTarget !== null}
        title="删除评论"
        message="确定删除这条评论吗?"
        confirmText="删除"
        onConfirm={() => void confirmDeleteComment()}
        onCancel={() => setDeleteCommentTarget(null)}
      />

      <ConfirmModal
        visible={deletePostVisible}
        title="删除帖子"
        message="确定删除这条帖子吗?删除后不可恢复。"
        confirmText="删除"
        onConfirm={() => void confirmDeletePost()}
        onCancel={() => setDeletePostVisible(false)}
      />
    </SafeAreaView>
  );
}

function CommentRow({
  comment,
  isMine,
  onDelete,
}: {
  comment: CircleComment;
  isMine: boolean;
  onDelete: () => void;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.commentRow, { backgroundColor: colors.card }]}>
      <UserAvatar avatar={comment.user.avatar} size={34} />
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentAuthor, { color: colors.textPrimary }]}>
            {comment.user.nickname}
          </Text>
          <Text style={[styles.commentTime, { color: colors.textTertiary }]}>
            {formatDateTime(comment.created_at)}
          </Text>
        </View>
        <Text style={[styles.commentContent, { color: colors.textPrimary }]}>
          {comment.content}
        </Text>
      </View>
      {isMine ? (
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text style={[styles.commentDelete, { color: colors.expense }]}>
            删除
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  listEmpty: {
    flexGrow: 1,
  },
  postCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.sm,
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
  rateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  rateButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deletePostText: {
    fontSize: 14,
    fontWeight: '600',
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
  },
  commentTime: {
    ...typography.caption,
  },
  commentContent: {
    ...typography.body,
    lineHeight: 20,
  },
  commentDelete: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  commentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    borderRadius: radius.fab,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontSize: 14,
    maxHeight: 80,
  },
  sendButton: {
    paddingHorizontal: 0,
  },
});
