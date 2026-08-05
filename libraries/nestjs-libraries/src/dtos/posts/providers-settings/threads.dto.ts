import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';

// Threads API 2026 업데이트로 컨테이너 생성 시 받을 수 있게 된 옵션들.
// 모두 선택값이라 값이 있을 때만 provider 가 파라미터를 붙인다.
export class ThreadsDto {
  // 답글 허용 범위. 발행 후에는 변경할 수 없다. 미지정 시 Threads 기본값(everyone).
  @IsIn(['everyone', 'accounts_you_follow', 'mentioned_only'])
  @IsOptional()
  reply_control?: 'everyone' | 'accounts_you_follow' | 'mentioned_only';

  // 토픽 태그. 포스트당 1개, 1~50자. 마침표와 앰퍼샌드는 허용되지 않는다.
  @ValidateIf((o) => o.topic_tag)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  topic_tag?: string;

  // 링크 미리보기. media_type=TEXT 인 텍스트 전용 포스트에만 적용된다.
  @ValidateIf((o) => o.link_attachment)
  @IsOptional()
  @IsUrl()
  link_attachment?: string;

  // 기존 thread finisher 설정. 프론트의 ThreadFinisher 가 사용한다.
  @IsOptional()
  active_thread_finisher?: boolean;

  @IsOptional()
  @IsString()
  thread_finisher?: string;
}
