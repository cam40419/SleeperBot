import type { LeagueAnalysis } from "./types";

function digest(analyses: LeagueAnalysis[]) {
  return analyses.map(a => `${a.leagueName} — Week ${a.week}\n${a.summary}\n${a.recommendations.slice(0, 5).map(r => `[${r.priority.toUpperCase()}] ${r.title}: ${r.action}`).join("\n")}`).join("\n\n");
}

export async function sendNotifications(analyses: LeagueAnalysis[], urgentOnly = false) {
  const selected = urgentOnly ? analyses.map(a => ({ ...a, recommendations: a.recommendations.filter(r => r.priority === "urgent" || r.priority === "high") })).filter(a => a.recommendations.length) : analyses;
  if (!selected.length) return { email: false, sms: false, skipped: "No matching alerts" };
  const body = digest(selected);
  let email = false, sms = false;
  if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO && process.env.ALERT_EMAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.ALERT_EMAIL_FROM, to: [process.env.ALERT_EMAIL_TO], subject: urgentOnly ? "Urgent Sleeper lineup alert" : "Your daily Sleeper Coach digest", text: body }) });
    email = response.ok;
    if (!response.ok) console.error("Resend failed", await response.text());
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER && process.env.ALERT_PHONE_TO) {
    const params = new URLSearchParams({ To: process.env.ALERT_PHONE_TO, From: process.env.TWILIO_FROM_NUMBER, Body: body.slice(0, 1500) });
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
    sms = response.ok;
    if (!response.ok) console.error("Twilio failed", await response.text());
  }
  return { email, sms };
}
