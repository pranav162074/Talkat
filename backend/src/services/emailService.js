import env from '../config/env.js';

export const sendOtpEmail = async (toEmail, name, code) => {
  // In development without a Brevo key, print the code so you can keep testing
  if (!env.brevoApiKey) {
    console.log(`[DEV] OTP for ${toEmail}: ${code}`);
    return;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Talkat', email: env.brevoSenderEmail },
      to: [{ email: toEmail, name }],
      subject: `${code} is your Talkat verification code`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:420px">
          <h2>Hi ${name},</h2>
          <p>Your Talkat verification code is:</p>
          <p style="font-size:32px;letter-spacing:6px;font-weight:bold">${code}</p>
          <p>It expires in 5 minutes. If you didn't request it, ignore this email.</p>
        </div>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo error ${response.status}: ${detail}`);
  }
};