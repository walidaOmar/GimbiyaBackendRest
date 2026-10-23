import jwt from "jsonwebtoken";
import { getJwtSecret } from "./jwtSecret.js";

export const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ userId }, getJwtSecret(), {
    expiresIn: "7d",
  });

  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return token;
};
