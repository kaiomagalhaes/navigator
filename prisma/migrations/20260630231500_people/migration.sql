-- DropForeignKey
ALTER TABLE "Participant" DROP CONSTRAINT "Participant_meetingId_fkey";

-- AlterTable
ALTER TABLE "CalendarEvent" DROP COLUMN "members";

-- DropTable
DROP TABLE "Participant";

-- CreateTable
CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MeetingToPerson" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_MeetingToPerson_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CalendarEventToPerson" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CalendarEventToPerson_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX "_MeetingToPerson_B_index" ON "_MeetingToPerson"("B");

-- CreateIndex
CREATE INDEX "_CalendarEventToPerson_B_index" ON "_CalendarEventToPerson"("B");

-- AddForeignKey
ALTER TABLE "_MeetingToPerson" ADD CONSTRAINT "_MeetingToPerson_A_fkey" FOREIGN KEY ("A") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MeetingToPerson" ADD CONSTRAINT "_MeetingToPerson_B_fkey" FOREIGN KEY ("B") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CalendarEventToPerson" ADD CONSTRAINT "_CalendarEventToPerson_A_fkey" FOREIGN KEY ("A") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CalendarEventToPerson" ADD CONSTRAINT "_CalendarEventToPerson_B_fkey" FOREIGN KEY ("B") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

