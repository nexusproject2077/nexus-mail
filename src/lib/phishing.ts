export type PhishingAssessment = { level: "none" | "warning" | "high"; reasons: string[]; suspiciousLinks: string[] };

const BRANDS = ["ameli", "impots", "gouv", "urssaf", "caf", "laposte", "chronopost", "dhl", "paypal", "microsoft", "apple", "google", "amazon", "credit agricole", "credit mutuel", "boursorama", "banque", "visa"];
const SENSITIVE = /(?:mot de passe|password|identifiant|code (?:de )?validation|carte bancaire|coordonn(?:ée|e) bancaire|rib|urgence|immédiatement|suspendu|bloqu(?:é|e)|vérifi(?:er|ez))/i;

function host(value: string): string | null { try { return new URL(value).hostname.toLowerCase(); } catch { return null; } }
function registeredDomain(value: string) { const parts = value.split("."); return parts.slice(-2).join("."); }

/** A deterministic local signal, not a claim that an email is certainly fraudulent. */
export function assessPhishing(input: { sender: string; subject: string; text?: string; html?: string }): PhishingAssessment {
  const content = `${input.subject}\n${input.text ?? ""}\n${input.html ?? ""}`;
  const links = [...content.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(match => match[0].replace(/&amp;/gi, "&"));
  const reasons: string[] = [];
  const suspiciousLinks: string[] = [];
  const senderHost = input.sender.split("@")[1]?.toLowerCase() ?? "";
  const branded = BRANDS.filter(brand => new RegExp(`\\b${brand.replace(/ /g, "\\s+")}\\b`, "i").test(content));

  if (senderHost.startsWith("xn--") || senderHost.includes(".xn--")) reasons.push("Le domaine de l’expéditeur utilise des caractères internationalisés.");
  if (branded.length && senderHost && !branded.some(brand => senderHost.includes(brand.replace(/ /g, "")))) reasons.push("Le nom d’un service connu ne correspond pas au domaine de l’expéditeur.");
  if (SENSITIVE.test(content)) reasons.push("Le message demande ou évoque des informations sensibles.");

  for (const link of links) {
    const linkHost = host(link);
    if (!linkHost) continue;
    const suspicious = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(linkHost) || linkHost.includes("xn--") || /@/.test(link) || /(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly)$/i.test(linkHost) || (branded.length > 0 && !branded.some(brand => registeredDomain(linkHost).includes(brand.replace(/ /g, ""))));
    if (suspicious) suspiciousLinks.push(linkHost);
  }
  if (suspiciousLinks.length) reasons.push("Un ou plusieurs liens ont une destination inhabituelle ou incohérente.");

  const high = suspiciousLinks.length > 0 && (SENSITIVE.test(content) || reasons.some(reason => reason.includes("expéditeur")));
  return { level: high ? "high" : reasons.length ? "warning" : "none", reasons, suspiciousLinks: [...new Set(suspiciousLinks)] };
}
