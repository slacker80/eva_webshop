const nodemailer = require('nodemailer');

function mailTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function orderLines(order) {
  return order.items.map(item => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    return `- ${quantity}x ${item.name} (${formatMoney(price)} per stuk) = ${formatMoney(quantity * price)}`;
  }).join('\n');
}

async function sendManualOrderEmail(order) {
  const transporter = mailTransporter();
  if (!transporter) {
    const err = new Error('SMTP is not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const notifyEmail = process.env.ORDER_NOTIFY_EMAIL || 'smallegangeeva@gmail.com';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const replyTo = order.email;

  const ownerText = `Nieuwe testbestelling via Crystal Jewelz

Let op: de webshop draait in testfase. Bestellingen, betalingen en verzendingen worden handmatig verwerkt.

Ordernummer: ${order.id}
Datum: ${order.createdAt}

Klant:
Naam: ${order.name}
E-mail: ${order.email}
Telefoon: ${order.phone || '-'}
Adres:
${order.address}

Opmerking:
${order.notes || '-'}

Artikelen:
${orderLines(order)}

Totaal: ${formatMoney(order.total)}

Actie:
Controleer de bestelling en stuur daarna handmatig een Rabobank betaalverzoek naar de klant.`;

  const customerText = `Beste ${order.name},

Bedankt voor je testbestelling bij Crystal Jewelz.

Let op: onze webshop draait nog in testfase. Je bestelling is nog niet automatisch betaald of verzonden. Wij controleren je bestelling handmatig en sturen daarna een betaalverzoek, bijvoorbeeld via Rabobank.

Ordernummer: ${order.id}

Artikelen:
${orderLines(order)}

Totaal: ${formatMoney(order.total)}

Bezorgadres:
${order.address}

Met vriendelijke groet,
Crystal Jewelz`;

  await transporter.sendMail({
    from,
    to: notifyEmail,
    replyTo,
    subject: `Nieuwe Crystal Jewelz testbestelling ${order.id}`,
    text: ownerText
  });

  await transporter.sendMail({
    from,
    to: order.email,
    replyTo: notifyEmail,
    subject: `Crystal Jewelz testbestelling ${order.id}`,
    text: customerText
  });
}

module.exports = { sendManualOrderEmail };
