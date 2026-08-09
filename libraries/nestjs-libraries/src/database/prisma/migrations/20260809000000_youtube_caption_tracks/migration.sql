CREATE TYPE "YoutubeCaptionStatus" AS ENUM (
  'PENDING',
  'UPLOADING',
  'UPLOADED',
  'FAILED'
);

CREATE TABLE "YoutubeCaptionTrack" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "name" TEXT,
  "filePath" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "status" "YoutubeCaptionStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "retryGeneration" INTEGER NOT NULL DEFAULT 0,
  "youtubeCaptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "YoutubeCaptionTrack_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "YoutubeCaptionTrack_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "YoutubeCaptionTrack_postId_language_key"
  ON "YoutubeCaptionTrack"("postId", "language");
CREATE INDEX "YoutubeCaptionTrack_postId_idx"
  ON "YoutubeCaptionTrack"("postId");
CREATE INDEX "YoutubeCaptionTrack_status_idx"
  ON "YoutubeCaptionTrack"("status");
