import { EmailStatus, Prisma, RecipientType } from "@prisma/client";
import { z } from "zod";
import { DEFAULT_QUERY_LIMIT } from "~/lib/constants";
import { BOUNCE_ERROR_MESSAGES } from "~/lib/constants/ses-errors";
import type { SesBounce } from "~/types/aws-types";
import type { EmailAttachment } from "~/types";

import {
  createTRPCRouter,
  emailProcedure,
  teamProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { cancelEmail, updateEmail } from "~/server/service/email-service";

const statuses = Object.values(EmailStatus) as [EmailStatus];

const ensureBounceObject = (
  data: Prisma.JsonValue,
): Partial<SesBounce> | undefined => {
  const raw =
    typeof data === "string"
      ? (() => {
          try {
            return JSON.parse(data);
          } catch {
            return undefined;
          }
        })()
      : data;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as Partial<SesBounce>;
};

const getBounceReasonFromParsed = (
  bounce: Partial<SesBounce>,
): string | undefined => {
  const diagnostic = bounce.bouncedRecipients?.[0]?.diagnosticCode?.trim();
  if (diagnostic) return diagnostic;

  const type = (bounce.bounceType ?? "").toString().trim() as
    | "Transient"
    | "Permanent"
    | "Undetermined"
    | "";
  const subtype = (bounce.bounceSubType ?? "")
    .toString()
    .trim()
    .replace(/\s+/g, "");

  if (type === "Permanent") {
    const key = (
      ["General", "NoEmail", "Suppressed", "OnAccountSuppressionList"].includes(
        subtype,
      )
        ? subtype
        : "General"
    ) as keyof typeof BOUNCE_ERROR_MESSAGES.Permanent;
    return BOUNCE_ERROR_MESSAGES.Permanent[key];
  }
  if (type === "Transient") {
    const key = (
      [
        "General",
        "MailboxFull",
        "MessageTooLarge",
        "ContentRejected",
        "AttachmentRejected",
      ].includes(subtype)
        ? subtype
        : "General"
    ) as keyof typeof BOUNCE_ERROR_MESSAGES.Transient;
    return BOUNCE_ERROR_MESSAGES.Transient[key];
  }
  if (type === "Undetermined") {
    return BOUNCE_ERROR_MESSAGES.Undetermined;
  }
  return undefined;
};

export const emailRouter = createTRPCRouter({
  emails: teamProcedure
    .input(
      z.object({
        page: z.number().optional(),
        status: z.enum(statuses).optional().nullable(),
        domain: z.number().optional(),
        search: z.string().optional().nullable(),
        apiId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = input.page || 1;
      const limit = DEFAULT_QUERY_LIMIT;
      const offset = (page - 1) * limit;

      const recipients = await db.$queryRaw<Array<{
        id: string;
        emailId: string;
        email: string;
        type: RecipientType;
        latestStatus: EmailStatus;
        createdAt: Date;
        scheduledAt: Date | null;
        subject: string;
        from: string;
      }>>`
        SELECT
          r.id,
          r."emailId",
          r.email,
          r.type,
          r."latestStatus",
          e."createdAt",
          e."scheduledAt",
          e.subject,
          e."from"
        FROM "EmailRecipient" r
        JOIN "Email" e ON r."emailId" = e.id
        WHERE e."teamId" = ${ctx.team.id}
        ${input.status ? Prisma.sql`AND r."latestStatus"::text = ${input.status}` : Prisma.sql``}
        ${input.domain ? Prisma.sql`AND e."domainId" = ${input.domain}` : Prisma.sql``}
        ${input.apiId ? Prisma.sql`AND e."apiId" = ${input.apiId}` : Prisma.sql``}
        ${
          input.search
            ? Prisma.sql`AND (
          e."subject" ILIKE ${`%${input.search}%`}
          OR r.email ILIKE ${`%${input.search}%`}
          OR e."from" ILIKE ${`%${input.search}%`}
        )`
            : Prisma.sql``
        }
        ORDER BY e."createdAt" DESC
        LIMIT ${DEFAULT_QUERY_LIMIT}
        OFFSET ${offset}
      `;

      return { recipients };
    }),

  downloadAttachment: teamProcedure
    .input(
      z.object({
        emailId: z.string(),
        attachmentIndex: z.number()
      })
    )
    .query(async ({ input, ctx }) => {
      const email = await db.email.findUnique({
        where: { id: input.emailId },
        select: {
          attachments: true,
          teamId: true
        }
      })

      if (!email) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Email not found"
        })
      }

      // Check team access
      if (email.teamId !== ctx.team.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied"
        })
      }

      if (!email.attachments) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No attachments found"
        })
      }

      const attachments = JSON.parse(email.attachments) as EmailAttachment[]
      const attachment = attachments[input.attachmentIndex]

      if (!attachment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Attachment not found"
        })
      }

      return {
        filename: attachment.filename,
        content: attachment.content,
        contentType: 'application/octet-stream'
      }
    }),

  exportEmails: teamProcedure
    .input(
      z.object({
        status: z.enum(statuses).optional().nullable(),
        domain: z.number().optional(),
        search: z.string().optional().nullable(),
        apiId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const recipients = await db.$queryRaw<
        Array<{
          from: string;
          email: string;
          latestStatus: EmailStatus;
          subject: string;
          scheduledAt: Date | null;
          createdAt: Date;
          bounceData: Prisma.JsonValue | null;
        }>
      >`
        SELECT
          e."from",
          r.email,
          r."latestStatus",
          e.subject,
          e."scheduledAt",
          e."createdAt",
          b.data as "bounceData"
        FROM "EmailRecipient" r
        JOIN "Email" e ON r."emailId" = e.id
        LEFT JOIN LATERAL (
          SELECT data
          FROM "EmailRecipientEvent"
          WHERE "recipientId" = r.id AND "status" = 'BOUNCED'
          ORDER BY "createdAt" DESC
          LIMIT 1
        ) b ON true
        WHERE e."teamId" = ${ctx.team.id}
        ${
          input.status
            ? Prisma.sql`AND r."latestStatus"::text = ${input.status}`
            : Prisma.sql``
        }
        ${
          input.domain
            ? Prisma.sql`AND e."domainId" = ${input.domain}`
            : Prisma.sql``
        }
        ${
          input.apiId
            ? Prisma.sql`AND e."apiId" = ${input.apiId}`
            : Prisma.sql``
        }
        ${
          input.search
            ? Prisma.sql`AND (
          e."subject" ILIKE ${`%${input.search}%`}
          OR r.email ILIKE ${`%${input.search}%`}
          OR e."from" ILIKE ${`%${input.search}%`}
        )`
            : Prisma.sql``
        }
        ORDER BY e."createdAt" DESC
        LIMIT 10000
      `;

      return recipients.map((recipient) => {
        const base = {
          sender: recipient.from,
          recipient: recipient.email,
          status: recipient.latestStatus,
          subject: recipient.subject,
          sentAt: (recipient.scheduledAt ?? recipient.createdAt).toISOString(),
        } as const;

        if (recipient.latestStatus !== "BOUNCED" || !recipient.bounceData) {
          return { ...base, bounceType: undefined, bounceSubType: undefined, bounceReason: undefined };
        }

        const bounce = ensureBounceObject(recipient.bounceData);
        const bounceType = bounce?.bounceType?.toString().trim() || undefined;
        const bounceSubType = bounce?.bounceSubType
          ? bounce.bounceSubType.toString().trim().replace(/\s+/g, "")
          : undefined;
        const bounceReason = bounce ? getBounceReasonFromParsed(bounce) : undefined;

        return { ...base, bounceType, bounceSubType, bounceReason };
      });
    }),

  getEmail: emailProcedure.query(async ({ input }) => {
    const email = await db.email.findUnique({
      where: {
        id: input.id,
      },
      select: {
        emailEvents: {
          orderBy: {
            status: "desc",
          },
        },
        id: true,
        createdAt: true,
        latestStatus: true,
        subject: true,
        to: true,
        cc: true,
        bcc: true,
        replyTo: true,
        from: true,
        domainId: true,
        text: true,
        html: true,
        scheduledAt: true,
      },
    });

    return email;
  }),

  getRecipient: teamProcedure
    .input(z.object({ recipientId: z.string() }))
    .query(async ({ input }) => {
      const recipient = await db.emailRecipient.findUnique({
        where: {
          id: input.recipientId,
        },
        include: {
          events: {
            orderBy: {
              createdAt: "desc",
            },
          },
          parentEmail: {
            select: {
              id: true,
              from: true,
              to: true,
              cc: true,
              bcc: true,
              replyTo: true,
              subject: true,
              html: true,
              text: true,
              createdAt: true,
              scheduledAt: true,
              attachments: true,
            },
          },
        },
      });

      return recipient;
    }),

  cancelEmail: emailProcedure.mutation(async ({ input }) => {
    await cancelEmail(input.id);
  }),

  updateEmailScheduledAt: emailProcedure
    .input(z.object({ scheduledAt: z.string().datetime() }))
    .mutation(async ({ input }) => {
      await updateEmail(input.id, { scheduledAt: input.scheduledAt });
    }),

  deleteRecipients: teamProcedure
    .input(z.object({ recipientIds: z.array(z.string()) }))
    .mutation(async ({ input, ctx }) => {
      // Verify all recipients belong to the team before deleting
      const recipients = await db.emailRecipient.findMany({
        where: {
          id: { in: input.recipientIds }
        },
        include: {
          parentEmail: {
            select: { teamId: true }
          }
        }
      });

      // Check that all recipients belong to the current team
      const unauthorizedRecipients = recipients.filter(
        recipient => recipient.parentEmail.teamId !== ctx.team.id
      );

      if (unauthorizedRecipients.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete recipients from other teams"
        });
      }

      // Delete the recipients and their events
      await db.$transaction([
        db.emailRecipientEvent.deleteMany({
          where: {
            recipientId: { in: input.recipientIds }
          }
        }),
        db.emailRecipient.deleteMany({
          where: {
            id: { in: input.recipientIds }
          }
        })
      ]);

      return { deletedCount: input.recipientIds.length };
    }),
});
