-- CreateTable
CREATE TABLE "Meeting" (
    "id" SERIAL NOT NULL,
    "recordingId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "meetingTitle" TEXT,
    "meetingType" TEXT,
    "url" TEXT NOT NULL,
    "meetingUrl" TEXT,
    "shareUrl" TEXT,
    "transcriptLanguage" TEXT,
    "sharedWith" TEXT,
    "calendarInviteesDomainsType" TEXT,
    "fathomCreatedAt" TIMESTAMP(3),
    "scheduledStartTime" TIMESTAMP(3),
    "scheduledEndTime" TIMESTAMP(3),
    "recordingStartTime" TIMESTAMP(3),
    "recordingEndTime" TIMESTAMP(3),
    "recordedByName" TEXT,
    "recordedByEmail" TEXT,
    "recordedByDomain" TEXT,
    "recordedByTeam" TEXT,
    "summaryTemplateName" TEXT,
    "summaryMarkdown" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiProcessedAt" TIMESTAMP(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailDomain" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "matchedSpeakerDisplayName" TEXT,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "idx" INTEGER NOT NULL,
    "speakerDisplayName" TEXT,
    "matchedInviteeEmail" TEXT,
    "text" TEXT NOT NULL,
    "timestamp" TEXT,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "userGenerated" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "recordingTimestamp" TEXT,
    "recordingPlaybackUrl" TEXT,
    "assigneeName" TEXT,
    "assigneeEmail" TEXT,
    "assigneeTeam" TEXT,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "meetingsFetched" INTEGER NOT NULL DEFAULT 0,
    "meetingsMatched" INTEGER NOT NULL DEFAULT 0,
    "meetingsUpserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_recordingId_key" ON "Meeting"("recordingId");

-- CreateIndex
CREATE INDEX "Meeting_fathomCreatedAt_idx" ON "Meeting"("fathomCreatedAt");

-- CreateIndex
CREATE INDEX "Meeting_recordedByEmail_idx" ON "Meeting"("recordedByEmail");

-- CreateIndex
CREATE INDEX "Participant_meetingId_idx" ON "Participant"("meetingId");

-- CreateIndex
CREATE INDEX "Participant_email_idx" ON "Participant"("email");

-- CreateIndex
CREATE INDEX "TranscriptSegment_meetingId_idx" ON "TranscriptSegment"("meetingId");

-- CreateIndex
CREATE INDEX "ActionItem_meetingId_idx" ON "ActionItem"("meetingId");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
