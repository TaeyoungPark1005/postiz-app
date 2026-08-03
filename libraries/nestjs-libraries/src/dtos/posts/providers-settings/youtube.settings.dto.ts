import {
  IsArray, IsBoolean, IsDefined, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested
} from 'class-validator';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';
import { Type } from 'class-transformer';

export class YoutubeTagsSettings {
  @IsString()
  value: string;

  @IsString()
  label: string;
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
}
