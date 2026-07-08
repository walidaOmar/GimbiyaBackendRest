import { MailtrapClient } from "mailtrap";
import dotenv from "dotenv";

dotenv.config();

export const mailtrapClient = new MailtrapClient({
  endpoint: process.env.MAILTRAP_ENDPOINT,
  token:    process.env.MAILTRAP_TOKEN,
});

export const sender = {
  email: process.env.MAILTRAP_FROM_EMAIL || "noreply@gimbiyamall.com",
  name:  process.env.MAILTRAP_FROM_NAME  || "Gimbiya Mall",
};
