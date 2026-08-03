'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { MediumTags } from '@gitroom/frontend/components/new-launch/providers/medium/medium.tags';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
import { Select } from '@gitroom/react/form/select';
import { YoutubePreview } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.preview';
const type = [
  {
    label: 'Public',
    value: 'public',
  },
  {
    label: 'Private',
    value: 'private',
  },
  {
    label: 'Unlisted',
    value: 'unlisted',
  },
];

const madeForKids = [
  {
    label: 'No',
    value: 'no',
  },
  {
    label: 'Yes',
    value: 'yes',
  },
];

// YouTube Data API 의 videoCategory ID. 업로드에 사용 가능한 것만 추렸다.
// 지역마다 사용 가능 목록이 달라 값이 없으면 아예 보내지 않는다.
const categories = [
  { label: 'Film & Animation', value: '1' },
  { label: 'Autos & Vehicles', value: '2' },
  { label: 'Music', value: '10' },
  { label: 'Pets & Animals', value: '15' },
  { label: 'Sports', value: '17' },
  { label: 'Travel & Events', value: '19' },
  { label: 'Gaming', value: '20' },
  { label: 'People & Blogs', value: '22' },
  { label: 'Comedy', value: '23' },
  { label: 'Entertainment', value: '24' },
  { label: 'News & Politics', value: '25' },
  { label: 'Howto & Style', value: '26' },
  { label: 'Education', value: '27' },
  { label: 'Science & Technology', value: '28' },
  { label: 'Nonprofits & Activism', value: '29' },
];

const languages = [
  { label: 'Korean', value: 'ko' },
  { label: 'English', value: 'en' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Chinese (Simplified)', value: 'zh-Hans' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Portuguese', value: 'pt' },
];
const YoutubeSettings: FC = () => {
  const { register, control } = useSettings();
  return (
    <div className="flex flex-col">
      <Input label="Title" {...register('title')} maxLength={100} />
      <Select
        label="Type"
        {...register('type', {
          value: 'public',
        })}
      >
        {type.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Select
        label="Made for kids"
        {...register('selfDeclaredMadeForKids', {
          value: 'no',
        })}
      >
        {madeForKids.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Select label="Category" {...register('categoryId')}>
        <option value="">Default</option>
        {categories.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Select label="Language" {...register('defaultLanguage')}>
        <option value="">Default</option>
        {languages.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Input
        label="Playlist ID"
        placeholder="Add the video to this playlist after upload (optional)"
        {...register('playlistId')}
      />
      <MediumTags label="Tags" {...register('tags')} />
      <div className="mt-[20px]">
        <MediaComponent
          type="image"
          width={1280}
          height={720}
          label="Thumbnail"
          description="Thumbnail picture (optional)"
          {...register('thumbnail')}
        />
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: YoutubeSettings,
  CustomPreviewComponent: YoutubePreview,
  dto: YoutubeSettingsDto,
  checkValidity: async (items) => {
    const [firstItems] = items ?? [];
    if (items?.[0]?.length !== 1) {
      return 'You need one media';
    }
    if ((firstItems?.[0]?.path?.indexOf?.('mp4') ?? -1) === -1) {
      return 'Item must be a video';
    }
    return true;
  },
  maximumCharacters: 5000,
});
