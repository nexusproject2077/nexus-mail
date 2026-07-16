import { Thread, Label } from "@/types/email";

function parseSender(sender: string): { name: string; email: string } {
  const match = sender.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2] };
  const parts = sender.split("@");
  const name = parts[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { name, email: sender };
}

// Pre-encrypted Confidential Mode demo (AES-256 via OpenPGP). Passcode: nexus2077.
// Generated client-side; the plaintext was never sent to any server.
const DEMO_CONFIDENTIAL_BODY =
  "{\"nexus\":\"e2ee\",\"v\":1,\"mode\":\"confidential\",\"armored\":\"-----BEGIN PGP MESSAGE-----\\n\\nwy4ECQMITDMc3RxGoDzgIEimOfw71m78bpa+2ezFb2cFFiMZJBe4lke766/B\\n+zNI0sDdAe8d3HEO9bwO7Em+ErLNKcHiEdPv1I1nFhiKz8FDlYbTcP0+jMf0\\n+4w/DUGY1/dKjYA/yc4xoffZcLdOQjMPSRgofnknXkKbvK5sTxMiVCmDDtVB\\nmitl80IoyiR5T10v6JDjF5LTaJGyiFwmAfVd+4zowUdkW/Bnn3fhG2p962/X\\nKNXoMtAjRSE3ueP4//22xOZAzmD6HIy6uYf4wwJdRm5KI8e7t/LZRfdiSsc3\\ngDlBKtLgkPPZhqEljEUFMzzeAhNuilesLGXU8fuSHbL/VgZXnCJNFGO1wunJ\\n5IIWkqi5u7grlyUcJHA/r2JT7PUI/2V+ORCj9GUPe5FOv/wiJSHtnFHXBTN7\\n0Z9Gyt01Csvpe2wck8y2DUKlTZX7IlZ/jKD+z4z7vKVV+r8+JwiGFBHxhDXk\\nIDK2xXUiLcmBQvXa1pNvTnOhkZG8ZBJEFg6Xxu3BYGQZqJUrIbRCkS3QdiqW\\nAeSSbSinKiH+LPjnfnfJ43VW8/GKVgN3SbckvwO0oWS5YDC562gRdmmzF1BJ\\n8cfcY9uYk93BRM1e55I=\\n=DVMh\\n-----END PGP MESSAGE-----\\n\",\"requiresPasscode\":true,\"recipientHint\":\"merickoken54@gmail.com\"}";

const rawThreads = [
  {
    id: "demo_confidential_001",
    messages: [
      {
        date: "2026-06-26T14:10:00Z",
        id: "demo_confidential_001",
        labelIds: ["UNREAD", "IMPORTANT", "Label_7", "INBOX"],
        sender: "Nexus Security <security@nexusmail.app>",
        snippet: "Message confidentiel chiffré — passcode requis pour ouvrir.",
        subject: "🔐 Message confidentiel de démonstration",
        toRecipients: ["merickoken54@gmail.com"],
        body: DEMO_CONFIDENTIAL_BODY,
        encryption: "confidential" as const,
      },
    ],
  },
  {
    id: "19f0427490b6b757",
    messages: [
      {
        date: "2026-06-26T13:38:30Z",
        id: "19f0427490b6b757",
        labelIds: ["UNREAD", "Label_8", "INBOX"],
        sender: "no-reply@mail.nordpass.com",
        snippet:
          "The offer ends tomorrow. 1 day left: Upgrade to Premium for $0.99/month",
        subject: "Last chance: Upgrade to Premium for $0.99/month",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f0401d9246fb7f",
    messages: [
      {
        date: "2026-06-26T12:57:37Z",
        id: "19f0401d9246fb7f",
        labelIds: ["IMPORTANT", "Label_9", "INBOX"],
        sender: "notifications@stripe.com",
        snippet: "Premiers pas avec votre compte Stripe",
        subject: "Confirmez votre adresse e-mail",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f03d466734beee",
    messages: [
      {
        date: "2026-06-26T12:05:40Z",
        id: "19f03d466734beee",
        labelIds: ["UNREAD", "Label_8", "INBOX"],
        sender: "McArthurGlenTroyes@mail.mcarthurglen.com",
        snippet:
          "Jusqu'à -70% à travers l'Europe. Voyagez. Shoppez. Économisez.",
        subject: "Cap sur les meilleurs spots shopping",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f03cc7b6db3e96",
    messages: [
      {
        date: "2026-06-26T11:59:20Z",
        id: "19f03cc7b6db3e96",
        labelIds: ["IMPORTANT", "Label_7", "INBOX"],
        sender: "notifications@github.com",
        snippet:
          "vercel[bot] left a comment — The latest updates on your projects.",
        subject:
          "Re: [nexusproject2077/nexus-social] Nexus Clips en vidéos courtes uniquement + responsive mobile (PR #16)",
        toRecipients: ["nexus-social@noreply.github.com"],
      },
    ],
  },
  {
    id: "19f03bca9fd2079d",
    messages: [
      {
        date: "2026-06-26T11:42:03Z",
        id: "19f03bca9fd2079d",
        labelIds: ["UNREAD", "Label_8", "INBOX"],
        sender: "wh0wr5hzzkbv176w@messagerie.leboncoin.fr",
        snippet:
          'Vous avez un nouveau message. Montre Michael Kors 80 € — Amira « Bonjour oui elle est disponible »',
        subject: 'Nouveau message pour "Montre Michael Kors" sur leboncoin',
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f03b26260ab34f",
    messages: [
      {
        date: "2026-06-26T11:30:49Z",
        id: "19f03b26260ab34f",
        labelIds: ["Label_7", "INBOX"],
        sender: "reviews@feedback-ekomi.com",
        snippet:
          "Bonjour Meric KOKEN, Vous êtes un élève d'Auto-ecole.net et nous vous remercions de votre confiance.",
        subject: "Nous aimerions avoir votre avis",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f038c0c5004b80",
    messages: [
      {
        date: "2026-06-26T10:48:57Z",
        id: "19f038c0c5004b80",
        labelIds: ["UNREAD", "IMPORTANT", "Label_7", "INBOX"],
        sender: "no-reply@mg.stych.fr",
        snippet:
          "Salut ! Tu es satisfait de ta formation, partage ton avis en cliquant ici",
        subject: "Fais savoir que tu es satisfait de Stych !",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f03841bf75506b",
    messages: [
      {
        date: "2026-06-26T10:40:16Z",
        id: "19f03841bf75506b",
        labelIds: ["UNREAD", "Label_8", "INBOX"],
        sender: "no.reply@leboncoin.fr",
        snippet:
          "La modification de votre annonce « Polo New Balance » est en ligne !",
        subject:
          'La modification de votre annonce "Polo New Balance" est en ligne',
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f032dfa320a038",
    messages: [
      {
        date: "2026-06-26T09:06:12Z",
        id: "19f032dfa320a038",
        labelIds: ["UNREAD", "Label_8", "INBOX"],
        sender: "wwe@email.wwe.com",
        snippet:
          "Zuffa Boxing comes to Dublin this summer! NOW LIVE: Exclusive Early Ticket Access",
        subject:
          "Exclusive Zuffa Boxing 10 Pre-Sale in Dublin Now Live!",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f0298645e0cfcd",
    messages: [
      {
        date: "2026-06-26T06:22:48Z",
        id: "19f0298645e0cfcd",
        labelIds: ["UNREAD", "Label_8", "INBOX"],
        sender: "newsletter@news.veepee.fr",
        snippet: "25 nouvelles ventes aujourd'hui sur Veepee.",
        subject:
          "Aujourd'hui : Nike, British Knights, Rains et 22 autres ventes sur Veepee",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f024699f006a5a",
    messages: [
      {
        date: "2026-06-26T04:53:28Z",
        id: "19f024699f006a5a",
        labelIds: ["UNREAD", "Label_8", "INBOX"],
        sender: "no-reply@render.com",
        snippet:
          "You're approaching the monthly usage limit for free web services. 605 of 750 free instance hours used.",
        subject: "[Important] Approaching monthly free usage limit",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f00bc9d939954c",
    messages: [
      {
        date: "2026-06-25T21:43:08Z",
        id: "19f00bc9d939954c",
        labelIds: ["UNREAD", "Label_7", "INBOX"],
        sender: "googleplay-noreply@google.com",
        snippet:
          "Merci. Votre abonnement sur Google Play a été prolongé et facturé.",
        subject: "Confirmation de votre commande Google Play du 25 juin 2026",
        toRecipients: ["Merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f00bc9439da8fa",
    messages: [
      {
        date: "2026-06-25T21:43:06Z",
        id: "19f00bc9439da8fa",
        labelIds: ["IMPORTANT", "Label_7", "INBOX"],
        sender: "googleplay-noreply@google.com",
        snippet:
          "Le prix de votre abonnement YouTube Premium va passer de 79,99 TRY/mois à 119,99 TRY/mois.",
        subject: "Le prix de votre abonnement à YouTube va augmenter",
        toRecipients: ["Merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f0036412aced75",
    messages: [
      {
        date: "2026-06-25T19:16:22Z",
        id: "19f0036412aced75",
        labelIds: ["UNREAD", "Label_7", "INBOX"],
        sender: "news@email.voyage-prive.com",
        snippet: "La liste de vos envies. Accédez à la version en ligne.",
        subject: "Puy du Fou dès 76€, Zanzibar, Canaries jusqu'à -79%",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f0007562c26557",
    messages: [
      {
        date: "2026-06-25T18:25:08Z",
        id: "19f0007562c26557",
        labelIds: ["UNREAD", "Label_7", "INBOX"],
        sender: "noreply-apps-scripts-notifications@google.com",
        snippet:
          "Your script, Projet sans titre, has recently failed to finish successfully.",
        subject:
          "Summary of failures for Google Apps Script: Projet sans titre",
        toRecipients: ["Merickoken54@gmail.com"],
      },
    ],
  },
  {
    id: "19f000054881c146",
    messages: [
      {
        date: "2026-06-25T18:17:29Z",
        id: "19f000054881c146",
        labelIds: ["UNREAD", "Label_7", "INBOX"],
        sender: "marketing@genezys-app.com",
        snippet: "Jalibert devient votre Père Noël préféré",
        subject: "Un booster parfait pour cette semaine",
        toRecipients: ["merickoken54@gmail.com"],
      },
    ],
  },
];

export const labels: Label[] = [
  { id: "INBOX", name: "Boîte de réception", color: "#6366f1" },
  { id: "STARRED", name: "Favoris", color: "#eab308" },
  { id: "SENT", name: "Messages envoyés", color: "#22c55e" },
  { id: "DRAFT", name: "Brouillons", color: "#f97316" },
  { id: "TRASH", name: "Corbeille", color: "#ef4444" },
  { id: "Label_7", name: "Très important", color: "#ef4444" },
  { id: "Label_8", name: "Important", color: "#eab308" },
  { id: "Label_9", name: "Normal", color: "#94a3b8" },
  { id: "Notes", name: "Notes", color: "#6366f1" },
];

export const threads: Thread[] = rawThreads.map((t) => {
  const lastMsg = t.messages[t.messages.length - 1];
  const { name, email } = parseSender(lastMsg.sender);
  return {
    id: t.id,
    messages: t.messages.map((m) => {
      const s = parseSender(m.sender);
      const extra = m as typeof m & {
        body?: string;
        encryption?: "pgp" | "confidential";
      };
      return {
        id: m.id,
        threadId: t.id,
        sender: m.sender,
        senderName: s.name,
        senderEmail: s.email,
        toRecipients: m.toRecipients,
        subject: m.subject,
        snippet: m.snippet,
        body: extra.body,
        date: m.date,
        labelIds: m.labelIds,
        isUnread: m.labelIds.includes("UNREAD"),
        isStarred: m.labelIds.includes("STARRED"),
        isImportant: m.labelIds.includes("IMPORTANT"),
        encryption: extra.encryption,
      };
    }),
    subject: lastMsg.subject,
    snippet: lastMsg.snippet,
    date: lastMsg.date,
    isUnread: lastMsg.labelIds.includes("UNREAD"),
    isStarred: lastMsg.labelIds.includes("STARRED"),
    labels: lastMsg.labelIds,
  };
});
