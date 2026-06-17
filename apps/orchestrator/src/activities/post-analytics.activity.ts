import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AnalyticsAgeBucket } from '@prisma/client';
import { PostAnalyticsService } from '@gitroom/nestjs-libraries/database/prisma/workspace-analytics/post-analytics.service';

@Injectable()
@Activity()
export class PostAnalyticsActivity {
  constructor(private _postAnalyticsService: PostAnalyticsService) {}

  @ActivityMethod()
  async collectPostSnapshots(postId: string, ageBucket: AnalyticsAgeBucket) {
    return this._postAnalyticsService.collectPostSnapshots(postId, ageBucket);
  }
}
