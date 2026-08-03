'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FC } from 'react';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';
import { Select } from '@gitroom/react/form/select';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { ThreadsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/threads.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const replyControl = [
  {
    value: 'everyone',
    label: 'Everyone',
  },
  {
    value: 'accounts_you_follow',
    label: 'Accounts you follow',
  },
  {
    value: 'mentioned_only',
    label: 'Mentioned only',
  },
];

const SettingsComponent: FC = () => {
  const { register } = useSettings();
  const t = useT();

  return (
    <>
      <ThreadFinisher />

      <Select
        label="Who can reply"
        {...register('reply_control', {
          value: 'everyone',
        })}
      >
        {replyControl.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      <Input
        label="Topic tag"
        placeholder={t(
          'threads_topic_tag_placeholder',
          'One topic per post, no # needed (optional)'
        )}
        maxLength={50}
        {...register('topic_tag')}
      />

      <Input
        label="Link attachment"
        placeholder={t(
          'threads_link_attachment_placeholder',
          'Link preview URL - text-only posts (optional)'
        )}
        {...register('link_attachment')}
      />
    </>
  );
};

export default withProvider<ThreadsDto>({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: ThreadsDto,
  checkValidity: async ([firstPost, ...otherPosts] = [], settings) => {
    // 토픽 태그는 마침표와 앰퍼샌드를 허용하지 않는다.
    if (settings?.topic_tag && /[.&]/.test(settings.topic_tag)) {
      return 'Topic tag cannot contain periods or ampersands';
    }

    // 링크 미리보기는 미디어가 없는 텍스트 전용 포스트에서만 동작한다.
    if (settings?.link_attachment && (firstPost?.length ?? 0) > 0) {
      return 'Link attachment is only supported on text-only posts';
    }

    const checkVideosLength = await Promise.all(
      firstPost
        ?.filter((f) => (f?.path?.indexOf?.('mp4') ?? -1) > -1)
        ?.flatMap((p) => p?.path)
        ?.map((p) => {
          return new Promise<number>((res) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = p;
            video.addEventListener('loadedmetadata', () => {
              res(video.duration);
            });
          });
        }) ?? []
    );

    for (const video of checkVideosLength) {
      if (video > 300) {
        return 'Video should be maximum 300 seconds (5 minutes)';
      }
    }

    return true;
  },
  maximumCharacters: 500,
});
