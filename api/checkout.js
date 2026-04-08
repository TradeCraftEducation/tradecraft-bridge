const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Parse the incoming Jotform data correctly
    let body = '';
    if (typeof req.body === 'string') {
      body = querystring.parse(req.body);
    } else {
      body = req.body;
    }

    console.log("Jotform Data Parsed:", body);

    // 2. Extract the fields using the unique names
    const { grand_total, account_id, cover_fees, typeA } = body;

    // 3. Gatekeeper: If they choose Invoice, bypass Stripe
    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    if (paymentMethod.includes('invoice')) {
      return res.redirect(303, 'https://tradecraftfundraising.com/success');
    }

    // 4. Math Setup
    const baseDonation = parseFloat(grand_total) || 0;
    if (baseDonation <= 0) throw new Error("Invalid donation amount");
    if (!account_id) throw new Error("Missing school account ID");

    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');
    const amountToCharge = donorSaidYes ? (baseDonation + 0.30) / (1 - 0.029) : baseDonation;
    const yourFeeCents = Math.round((baseDonation * 0.035) * 100);

    // 5. Create the Stripe Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amountToCharge * 100),
          product_data: { 
            name: 'Fundraiser Donation',
            description: donorSaidYes ? 'Processing fees included' : 'Standard Donation'
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: yourFeeCents,
        transfer_data: { destination: account_id }, 
      },
      success_url: 'https://tradecraftfundraising.com/success',
      cancel_url: 'https://tradecraftfundraising.com/cancel',
    });

    res.redirect(303, session.url);

  } catch (err) {
    console.error("BRIDGE ERROR:", err.message);
    res.redirect(303, 'https://tradecraftfundraising.com/success');
  }
}
