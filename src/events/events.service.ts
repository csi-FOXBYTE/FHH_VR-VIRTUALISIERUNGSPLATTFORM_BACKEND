import { createService } from "@csi-foxbyte/fastify-toab";
import dayjs from "dayjs";
import {
  getAuthService,
  getDbService,
  getNotificationService,
  getPrismaService,
  getTranslationService,
} from "../@internals/index.js";
import ics from "ics";
import ejs from "ejs";
import { readFile } from "fs/promises";

const eventsService = createService(
  "events",
  async ({ services }) => {
    const HEARTBEAT_DELAY_MS = 15_000;
    const HEARTBEAT_CHECK_MS = 20_000;

    const dbService = await getDbService(services);
    const prismaService = await getPrismaService(services);
    const authService = await getAuthService(services);
    const notificationService = await getNotificationService(services);

    const translationService = await getTranslationService(services);

    async function fetchAll() {
      return await dbService.event.findMany({
        select: {
          title: true,
          status: true,
          joinCode: true,
        },
      });
    }

    async function fetchStatus(id: string) {
      return await dbService.event.findFirstOrThrow({
        where: {
          id,
        },
        select: {
          joinCode: true,
          status: true,
        },
      });
    }

    async function checkHeartbeat(id: string) {
      const { heartbeatTimestamp, status } =
        await dbService.event.findFirstOrThrow({
          where: { id },
          select: { heartbeatTimestamp: true, status: true },
        });

      if (status !== "ACTIVE") return;

      if (
        dayjs(heartbeatTimestamp).isBefore(
          dayjs().subtract(HEARTBEAT_DELAY_MS, "second")
        )
      )
        return;

      await dbService.event.update({
        where: {
          id,
        },
        data: {
          status: "MISSING_HOST",
        },
      });
    }

    return {
      async createEvent({
        attendees,
        moderators,
        endTime,
        startTime,
        title,
      }: {
        endTime: string;
        startTime: string;
        title: string;
        attendees: string[];
        moderators: string[];
      }) {
        const created = await dbService.event.create({
          data: {
            endTime,
            startTime,
            status: "PLANNED",
            title,
            owner: {
              connect: {
                email: (await authService.getSession())!.user.email,
              },
            },
            attendees: {
              createMany: {
                data: attendees.map((attendee) => ({
                  userId: attendee,
                  role: moderators.includes(attendee) ? "MODERATOR" : "GUEST",
                })),
              },
            },
          },
          select: {
            id: true,
            owner: {
              select: {
                name: true,
                email: true,
              },
            },
            attendees: {
              select: {
                role: true,
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        });

        return; // TODO: Implement email

        const translator = translationService.getTranslator("de");
        const formatter = translationService.getFormatter("de");

        const templateFile = await readFile("../templates/mail-invitation.ejs");

        await notificationService.notify(
          created.attendees.map(({ user }) => {
            const mailContent = ejs.render(templateFile.toString("utf-8"), {
              t: translator,
              title,
              formatter,
              startTime,
              endTime,
              user,
            });

            const event = ics.createEvent({
              start: startTime,
              end: endTime,
              title: title,
              url: "https://fhhvr.foxbyte.de",
              description: mailContent,
              htmlContent: mailContent,
              organizer: {
                email: created.owner?.email,
                name: created.owner?.name ?? undefined,
              },
              busyStatus: "BUSY",
              uid: created.id,
              alarms: [
                {
                  action: "display",
                  description: title,
                  trigger: { before: true, hours: 1 },
                },
                {
                  action: "display",
                  description: title,
                  trigger: { before: true, minutes: 15 },
                },
              ],
              status: "CONFIRMED",
              attendees: created.attendees.map(({ user, role }) => ({
                email: user.email,
                name: user.name ?? undefined,
                role:
                  role === "MODERATOR" ? "REQ-PARTICIPANT" : "OPT-PARTICIPANT",
              })),
            });

            if (!event.value || event.error)
              throw new Error("Could not generate ics event!");

            const eventFile = new File(
              [new Blob([event.value], { type: "text/calendar" })],
              "event.ics",
              {
                type: "text/calendar",
              }
            );

            return {
              attachments: [eventFile],
              content: mailContent,
              from: created.owner?.email ?? "-",
              title: translator("notifications.event-invitation-title"),
              to: user.email,
            };
          })
        );
      },

      async updateEvent({
        id,
        attendees,
        moderators,
        endTime,
        startTime,
        title,
      }: {
        id: string;
        endTime?: string;
        startTime?: string;
        title?: string;
        attendees?: string[];
        moderators?: string[];
      }) {
        return await dbService.event.update({
          data: {
            endTime,
            startTime,
            title,
            attendees: attendees
              ? {
                  deleteMany: {},
                  createMany: {
                    data: attendees.map((attendee) => ({
                      userId: attendee,
                      role: moderators?.includes(attendee)
                        ? "MODERATOR"
                        : "GUEST",
                    })),
                  },
                }
              : undefined,
          },
          where: {
            id,
          },
        });
      },

      fetchAll,

      fetchStatus,

      list() {
        return prismaService.event.subscribe();
      },

      status(id: string) {
        return prismaService.event.subscribe();
      },

      async setHeartbeat(id: string) {
        await dbService.event.update({
          where: {
            id,
          },
          data: {
            heartbeatTimestamp: new Date().toISOString(),
          },
        });

        setTimeout(() => checkHeartbeat(id), HEARTBEAT_CHECK_MS);
      },

      checkHeartbeat,

      async hostSession(id: string, joinCode: string) {
        await dbService.event.update({
          where: {
            id,
          },
          data: {
            status: "ACTIVE",
            heartbeatTimestamp: new Date().toISOString(),
            joinCode,
          },
        });

        setTimeout(() => checkHeartbeat(id), HEARTBEAT_CHECK_MS);
      },

      async endSession(id: string) {
        await dbService.event.update({
          where: {
            id,
          },
          data: {
            status: "END",
            joinCode: null,
            heartbeatTimestamp: null,
          },
        });
      },

      async rehostSession(id: string, joinCode: string) {
        await dbService.event.update({
          where: {
            id,
          },
          data: {
            status: "ACTIVE",
            joinCode,
            heartbeatTimestamp: new Date().toISOString(),
          },
        });
      },
    };
  },
  { scope: "REQUEST" }
);

/*
AUTOGENERATED!
*/

export default eventsService;
