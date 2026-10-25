/** A configured mail account. `password` is only present in memory. */
export interface Account {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
  authType: "password" | "google_oauth";
  /** Present only in memory for Google accounts; never returned to the browser. */
  refreshToken?: string;
  createdAt: string;
}

/** Account as returned to clients — never includes the password. */
export type PublicAccount = Omit<Account, "password" | "refreshToken">;

/** A message envelope for list views. */
export interface MessageSummary {
  uid: string;
  threadId?: string;
  subject: string;
  from: { name: string; email: string };
  to: string[];
  date: string;
  snippet: string;
  seen: boolean;
  flagged: boolean;
  labelIds: string[];
}

/** A fully parsed message. */
export interface MessageDetail extends MessageSummary {
  text: string;
  html: string | null;
  attachments?: Array<{ id: string; filename: string; contentType: string; size: number }>;
}
