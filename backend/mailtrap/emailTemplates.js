const BRAND = {
  primary: "#C8A84B",
  dark:    "#050510",
  surface: "#0D0D1F",
};

export const VERIFICATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email — Gimbiya Mall</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #E8E8F0; max-width: 600px; margin: 0 auto; padding: 20px; background: #0A0A1A;">
  <div style="background: linear-gradient(135deg, #050510 0%, #0D0D1F 100%); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; border-bottom: 2px solid #C8A84B;">
    <h1 style="color: #C8A84B; margin: 0; font-size: 24px; letter-spacing: 2px;">GIMBIYA MALL</h1>
    <p style="color: #9B9BB8; margin: 4px 0 0; font-size: 12px; letter-spacing: 1px;">STRATEGIC ECOSYSTEM & GOVERNANCE ARCHITECTURE</p>
  </div>
  <div style="background-color: #0D0D1F; padding: 30px 20px; border-radius: 0 0 8px 8px; border: 1px solid #1E1E3F; border-top: none;">
    <h2 style="color: #E8E8F0; margin-top: 0;">Verify Your Email Address</h2>
    <p style="color: #9B9BB8;">Welcome to Gimbiya Mall. To complete your registration and activate your account, enter the verification code below:</p>
    <div style="text-align: center; margin: 30px 0; padding: 20px; background: #050510; border: 1px solid #C8A84B; border-radius: 8px;">
      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #C8A84B; font-family: monospace;">{verificationCode}</span>
    </div>
    <p style="color: #9B9BB8;">This code will expire in <strong style="color: #C8A84B;">24 hours</strong>.</p>
    <p style="color: #9B9BB8;">If you did not create a Gimbiya Mall account, please ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #1E1E3F; margin: 20px 0;">
    <p style="color: #3A3A5A; font-size: 12px; text-align: center;">Gimbiya Mall · Abuja · Kano · Kaduna</p>
  </div>
</body>
</html>
`;

export const WELCOME_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome to Gimbiya Mall</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #E8E8F0; max-width: 600px; margin: 0 auto; padding: 20px; background: #0A0A1A;">
  <div style="background: linear-gradient(135deg, #050510 0%, #0D0D1F 100%); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; border-bottom: 2px solid #C8A84B;">
    <h1 style="color: #C8A84B; margin: 0; font-size: 24px; letter-spacing: 2px;">GIMBIYA MALL</h1>
  </div>
  <div style="background-color: #0D0D1F; padding: 30px 20px; border-radius: 0 0 8px 8px; border: 1px solid #1E1E3F; border-top: none;">
    <h2 style="color: #C8A84B;">Welcome, {name}!</h2>
    <p style="color: #9B9BB8;">Your account is now verified and active. You are now part of Nigeria's premier digital commerce ecosystem.</p>
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; background: #C8A84B; color: #050510; width: 60px; height: 60px; line-height: 60px; border-radius: 50%; font-size: 28px; font-weight: bold;">✓</div>
    </div>
    <p style="color: #9B9BB8;">You can now:</p>
    <ul style="color: #9B9BB8;">
      <li>Browse products across Abuja, Kano, and Kaduna</li>
      <li>Place secure escrow-protected orders</li>
      <li>Track your deliveries in real time</li>
    </ul>
    <hr style="border: none; border-top: 1px solid #1E1E3F; margin: 20px 0;">
    <p style="color: #3A3A5A; font-size: 12px; text-align: center;">Gimbiya Mall · Nigeria's Premium Digital Marketplace</p>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_REQUEST_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Reset Your Password — Gimbiya Mall</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #E8E8F0; max-width: 600px; margin: 0 auto; padding: 20px; background: #0A0A1A;">
  <div style="background: linear-gradient(135deg, #050510 0%, #0D0D1F 100%); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; border-bottom: 2px solid #C8A84B;">
    <h1 style="color: #C8A84B; margin: 0; font-size: 24px; letter-spacing: 2px;">GIMBIYA MALL</h1>
  </div>
  <div style="background-color: #0D0D1F; padding: 30px 20px; border-radius: 0 0 8px 8px; border: 1px solid #1E1E3F; border-top: none;">
    <h2 style="color: #E8E8F0;">Password Reset Request</h2>
    <p style="color: #9B9BB8;">We received a request to reset the password for your Gimbiya Mall account. If you did not make this request, you can safely ignore this email.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{resetURL}" style="background-color: #C8A84B; color: #050510; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; letter-spacing: 1px;">RESET PASSWORD</a>
    </div>
    <p style="color: #9B9BB8;">This link will expire in <strong style="color: #C8A84B;">1 hour</strong>.</p>
    <p style="color: #9B9BB8;">For security, never share this link with anyone.</p>
    <hr style="border: none; border-top: 1px solid #1E1E3F; margin: 20px 0;">
    <p style="color: #3A3A5A; font-size: 12px; text-align: center;">Gimbiya Mall · Secure Account Management</p>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_SUCCESS_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Password Reset Successful — Gimbiya Mall</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #E8E8F0; max-width: 600px; margin: 0 auto; padding: 20px; background: #0A0A1A;">
  <div style="background: linear-gradient(135deg, #050510 0%, #0D0D1F 100%); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; border-bottom: 2px solid #C8A84B;">
    <h1 style="color: #C8A84B; margin: 0; font-size: 24px; letter-spacing: 2px;">GIMBIYA MALL</h1>
  </div>
  <div style="background-color: #0D0D1F; padding: 30px 20px; border-radius: 0 0 8px 8px; border: 1px solid #1E1E3F; border-top: none;">
    <h2 style="color: #00D98B;">Password Reset Successful</h2>
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; background: #00D98B; color: #050510; width: 60px; height: 60px; line-height: 60px; border-radius: 50%; font-size: 28px; font-weight: bold;">✓</div>
    </div>
    <p style="color: #9B9BB8;">Your Gimbiya Mall account password has been reset successfully.</p>
    <p style="color: #9B9BB8;">If you did not initiate this change, contact support immediately.</p>
    <hr style="border: none; border-top: 1px solid #1E1E3F; margin: 20px 0;">
    <p style="color: #3A3A5A; font-size: 12px; text-align: center;">Gimbiya Mall · Account Security</p>
  </div>
</body>
</html>
`;

export const KYC_APPROVED_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>KYC Approved — Gimbiya Mall</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #E8E8F0; max-width: 600px; margin: 0 auto; padding: 20px; background: #0A0A1A;">
  <div style="background: linear-gradient(135deg, #050510 0%, #0D0D1F 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; border-bottom: 2px solid #C8A84B;">
    <h1 style="color: #C8A84B; margin: 0; letter-spacing: 2px;">GIMBIYA MALL</h1>
  </div>
  <div style="background-color: #0D0D1F; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #1E1E3F; border-top: none;">
    <h2 style="color: #00D98B;">KYC Verification Approved ✓</h2>
    <p style="color: #9B9BB8;">Congratulations, <strong style="color: #C8A84B;">{name}</strong>! Your identity verification has been approved.</p>
    <p style="color: #9B9BB8;">Your account is now fully activated. You can begin using all features of your <strong style="color: #C8A84B;">{role}</strong> dashboard.</p>
    <hr style="border: none; border-top: 1px solid #1E1E3F; margin: 20px 0;">
    <p style="color: #3A3A5A; font-size: 12px; text-align: center;">Gimbiya Mall · KYC Verification</p>
  </div>
</body>
</html>
`;

export const KYC_REJECTED_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>KYC Requires Attention — Gimbiya Mall</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #E8E8F0; max-width: 600px; margin: 0 auto; padding: 20px; background: #0A0A1A;">
  <div style="background: linear-gradient(135deg, #050510 0%, #0D0D1F 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; border-bottom: 2px solid #C8A84B;">
    <h1 style="color: #C8A84B; margin: 0; letter-spacing: 2px;">GIMBIYA MALL</h1>
  </div>
  <div style="background-color: #0D0D1F; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #1E1E3F; border-top: none;">
    <h2 style="color: #EF4444;">KYC Verification Requires Attention</h2>
    <p style="color: #9B9BB8;">Hi <strong style="color: #C8A84B;">{name}</strong>, your KYC submission could not be approved at this time.</p>
    <div style="background: #1A0A0A; border: 1px solid #EF444440; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <p style="color: #EF4444; margin: 0;"><strong>Reason:</strong> {reason}</p>
    </div>
    <p style="color: #9B9BB8;">Please resubmit your documents addressing the above issue. Contact support if you need assistance.</p>
    <hr style="border: none; border-top: 1px solid #1E1E3F; margin: 20px 0;">
    <p style="color: #3A3A5A; font-size: 12px; text-align: center;">Gimbiya Mall · KYC Verification</p>
  </div>
</body>
</html>
`;
