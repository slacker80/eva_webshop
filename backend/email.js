const nodemailer = require('nodemailer');

async function sendOrderConfirmation(toEmail, orderData) {
  if (!process.env.SMTP_HOST) {
    console.warn('SMTP not configured, skipping order confirmation email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@crystaljewelz.nl',
    to: toEmail,
    subject: 'Crystal Jewelz - Orderbevestiging',
    text: `Beste klant,

Bedankt voor je bestelling bij Crystal Jewelz! We zijn blij dat je voor ons hebt gekozen.

Bestelgegevens:
Naam: ${orderData.name}
E-mail: ${orderData.email}
Bezorgadres: ${orderData.address}

We verwerken je bestelling zo snel mogelijk.

Met vriendelijke groet,
Crystal Jewelz Team`
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendOrderConfirmation };
