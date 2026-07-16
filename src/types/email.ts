export interface Email {
  id: string;
  threadId: string;
  sender: string;
  senderName: string;
  senderEmail: string;
  toRecipients: string[];
  subject: string;
  snippet: string;
  body?: string;
  htmlBody?: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  isImportant: boolean;
  hasAttachment?: boolean;
  /** Present when `body` holds a Nexus encrypted envelope. */
  encryption?: "pgp" | "confidential";
}

export interface Thread {
  id: string;
  messages: Email[];
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  isStarred: boolean;
  labels: string[];
}

export interface Label {
  id: string;
  name: string;
  color?: string;
  count?: number;
}

export type Folder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'trash' | 'all' | 'vault';
