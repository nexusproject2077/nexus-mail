import nodemailer from "nodemailer";
import type { Account } from "./types.js";

export interface OutgoingMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Send a message through the account's SMTP server. */
export async function sendMessage(
  account: Account,
  message: OutgoingMessage,
): Promise<{ messageId: string }> {
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: { user: account.username, pass: account.password },
  });
  const info = await transporter.sendMail({
    from: { name: account.label, address: account.email },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { messageId: info.messageId };
}
