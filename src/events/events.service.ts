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

        const translator = translationService.getTranslator("de");
        const formatter = translationService.getFormatter("de");

        await notificationService.notify(
          created.attendees.map(({ user }) => {
            const mailContent = `
  <p>${translator("notifications.event-invitation-greeting", {
    userName: user.name ?? user.email,
  })}</p>
  <p>${translator("notifications.event-invitation-intro", {
    eventTitle: `<strong>${title}</strong>`,
  })}</p>
  <p><strong>${translator(
    "notifications.event-invitation-datetime-label"
  )}</strong><br>${translator("notifications.event-invitation-datetime", {
              relativeTime: formatter.dateTimeRange(
                new Date(startTime),
                new Date(endTime),
                { dateStyle: "short" }
              ),
            })}</p>
  <p>${translator("notifications.event-invitation-online-info")}</p>
  <p>${translator("notifications.event-invitation-attachment-info")}</p>
  <p>${translator("notifications.event-invitation-outro")}</p>
  <p>${translator("notifications.event-invitation-signoff")}<br>${translator(
              "notifications.event-invitation-team"
            )}</p>
`;

            const description = `${translator(
              "notifications.event-invitation-greeting",
              {
                userName: user.name ?? user.email,
              }
            )}

${translator("notifications.event-invitation-intro", {
  eventTitle: title,
})}

 ${translator("notifications.event-invitation-datetime-label")} ${translator(
              "notifications.event-invitation-datetime",
              {
                relativeTime: formatter.dateTimeRange(
                  new Date(startTime),
                  new Date(endTime),
                  { dateStyle: "short" }
                ),
              }
            )}
  ${translator("notifications.event-invitation-online-info")}
  ${translator("notifications.event-invitation-attachment-info")}
  ${translator("notifications.event-invitation-outro")}
  ${translator("notifications.event-invitation-signoff")}${translator(
              "notifications.event-invitation-team"
            )}`;

            const event = ics.createEvent({
              start: startTime,
              end: endTime,
              title: title,
              url: "https://fhhvr.foxbyte.de",
              description: description,
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
