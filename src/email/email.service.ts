import { createService } from "@csi-foxbyte/fastify-toab";
import nodemailer from "nodemailer";

export type EmailParameters = Pick<
  Parameters<ReturnType<typeof nodemailer.createTransport>["sendMail"]>[0],
  "to" | "html" | "attachments" | "subject"
>;

const emailService = createService("email", async ({ queues }) => {
  const testAccount = await nodemailer.createTestAccount();

  const transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return {
    async sendMail(args: EmailParameters) {
      const info = await transporter.sendMail({
        from: testAccount.user,
        ...args,
      });

      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    },
  };
});

export default emailService;
