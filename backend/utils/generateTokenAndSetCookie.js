import jwt from "jsonwebtoken";

// Generates JWT and sets httpOnly cookie — taken directly from MERN starter
export const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    httpOnly: true,                                           // XSS protection
    secure:   process.env.NODE_ENV === "production",         // HTTPS only in prod
    sameSite: "strict",                                      // CSRF protection
    maxAge:   7 * 24 * 60 * 60 * 1000,                      // 7 days in ms
  });

  return token;
};
