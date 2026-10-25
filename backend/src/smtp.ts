import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import type { Account } from "./types.js";

export interface OutgoingMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; contentType: string; data: string }>;
}

/** Find the provider's Sent mailbox using IMAP special-use flags before falling back to common names. */
async function saveSentCopy(account: Account, raw: Buffer): Promise<void> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: { user: account.username, pass: account.password },
    logger: false,
    socketTimeout: 30000,
  });
  await client.connect();
  try {
    const boxes = await client.list();
    const sent = boxes.find(box => box.specialUse === "\\Sent")
      ?? boxes.find(box => /^(sent|sent items|sent messages|messages envoyés|envoyés|inbox\.sent)$/i.test(box.path));
    if (!sent) throw new Error("Dossier Envoyés introuvable sur le serveur IMAP");
    await client.append(sent.path, raw, ["\\Seen"], new Date());
  } finally {
    await client.logout();
  }
}

/** SMTP submission with mandatory TLS, followed by an IMAP Sent copy. */
export async function sendMessage(
  account: Account,
  message: OutgoingMessage,
): Promise<{ messageId: string; sentCopySaved: boolean; warning?: string }> {
  const attachments = message.attachments?.map(a => ({
    filename: a.filename,
    contentType: a.contentType,
    content: Buffer.from(a.data, "base64"),
  }));
  const mail = {
    from: { name: account.label, address: account.email },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments,
  };
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    requireTLS: !account.smtpSecure,
    auth: { user: account.username, pass: account.password },
  });
  const info = await transporter.sendMail(mail);
  // Rebuild the exact MIME structure for IMAP append. Keep the SMTP-generated
  // Message-ID so the copy is recognizable as the same message.
  const mimeTransport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const mime = await mimeTransport.sendMail({ ...mail, messageId: info.messageId, date: new Date() });
  try {
    await saveSentCopy(account, mime.message as Buffer);
    return { messageId: info.messageId, sentCopySaved: true };
  } catch {
    // SMTP already accepted the message: never report a send failure that might
    // cause the user to retry and accidentally deliver it twice.
    return { messageId: info.messageId, sentCopySaved: false, warning: "Message envoyé, mais la copie IMAP dans Envoyés n'a pas pu être enregistrée." };
  }
}
