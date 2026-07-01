-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "conferenceUrl" TEXT,
    "members" TEXT[],
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDaySync" (
    "day" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarDaySync_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_day_idx" ON "CalendarEvent"("day");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_account_uid_start_key" ON "CalendarEvent"("account", "uid", "start");
