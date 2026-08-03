import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsIn,
  IsString,
  ValidateNested,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';

export class Collaborators {
  @IsDefined()
  @IsString()
  label: string;
}

// 사람 태그(user_tags). Instagram Graph API 는 컨테이너 생성 시
// user_tags=[{username}] 형태를 받는다. label 에 @ 없는 username 을 담는다.
export class InstagramUserTag {
  @IsDefined()
  @IsString()
  label: string;
}

export class InstagramDto {
  @IsIn(['post', 'story'])
  @IsDefined()
  post_type: 'post' | 'story';

  @IsOptional()
  is_trial_reel?: boolean;

  @IsIn(['MANUAL', 'SS_PERFORMANCE'])
  @IsOptional()
  graduation_strategy?: 'MANUAL' | 'SS_PERFORMANCE';

  @Type(() => Collaborators)
  @ValidateNested({ each: true })
  @IsArray()
  @IsOptional()
  collaborators: Collaborators[];

  // 릴스 커버 이미지(cover_url). 값이 있을 때만 provider 가 붙이며,
  // Instagram 은 cover_url 이 thumb_offset 보다 우선한다. 권장 1080x1920(9:16).
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  cover?: MediaDto;

  // 사람 태그. 스토리에는 적용되지 않는다.
  @Type(() => InstagramUserTag)
  @ValidateNested({ each: true })
  @IsArray()
  @IsOptional()
  user_tags?: InstagramUserTag[];

  // 위치 태그. Facebook Page ID 형태의 숫자 문자열.
  @IsOptional()
  @IsString()
  location_id?: string;

  // 접근성 대체 텍스트. 이미지 단일 포스트에만 적용된다.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  alt_text?: string;
}
