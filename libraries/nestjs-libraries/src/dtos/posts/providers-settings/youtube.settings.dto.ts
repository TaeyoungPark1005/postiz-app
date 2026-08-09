import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';
import { Transform, Type } from 'class-transformer';
import {
  IsBcp47LanguageConstraint,
  IsTrustedCaptionPathConstraint,
  normalizeBcp47Language,
} from './youtube-caption.validators';

export class YoutubeTagsSettings {
  @IsString()
  value: string;

  @IsString()
  label: string;
}

export class YoutubeCaptionFileDto {
  @IsString()
  @IsDefined()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @Validate(IsTrustedCaptionPathConstraint)
  path: string;

  @IsString()
  @IsDefined()
  originalName: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  size: number;

  @Equals('application/x-subrip')
  mimeType: 'application/x-subrip';
}

export class YoutubeCaptionSettingsDto {
  @IsString()
  @IsDefined()
  @Transform(({ value }) => normalizeBcp47Language(value) ?? value)
  @Validate(IsBcp47LanguageConstraint)
  language: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => YoutubeCaptionFileDto)
  file: YoutubeCaptionFileDto;
}

export class YoutubeSettingsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsDefined()
  title: string;

  @IsIn(['public', 'private', 'unlisted'])
  @IsDefined()
  type: string;

  @IsIn(['yes', 'no'])
  @IsOptional()
  selfDeclaredMadeForKids: 'no' | 'yes';

  // 변경된 콘텐츠/AI 생성 공개(YouTube "How this content was made"). 값이 있을
  // 때만 provider 가 videos.insert 의 status.containsSyntheticMedia 로 넘긴다 —
  // opt-in 이라 이 필드를 안 보내는 다른 워크스페이스/서비스 발행엔 영향 없음.
  @IsBoolean()
  @IsOptional()
  containsSyntheticMedia?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  thumbnail?: MediaDto;

  // videos.insert 의 snippet.categoryId. YouTube 카테고리 숫자 ID 문자열.
  @IsString()
  @IsOptional()
  categoryId?: string;

  // snippet.defaultLanguage — 제목/설명의 언어(BCP-47).
  @IsString()
  @IsOptional()
  defaultLanguage?: string;

  // 업로드 후 이 재생목록에 자동 추가한다(playlistItems.insert).
  @IsString()
  @IsOptional()
  playlistId?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested()
  @Type(() => YoutubeTagsSettings)
  tags: YoutubeTagsSettings[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @ArrayUnique((track: YoutubeCaptionSettingsDto) =>
    track?.language?.toLowerCase()
  )
  @ValidateNested({ each: true })
  @Type(() => YoutubeCaptionSettingsDto)
  captions?: YoutubeCaptionSettingsDto[];
}
