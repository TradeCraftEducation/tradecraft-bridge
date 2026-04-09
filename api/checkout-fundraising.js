const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Parse incoming Jotform data
    let body = '';
    if (typeof req.body === 'string') {
      body = querystring.parse(req.body);
    } else {
      body = req.body;
    }

    // 2. Extract fields from Jotform
    const { grand_total, account_id, cover_fees, typeA } = body;

    // 3. Invoice Bypass (Gatekeeper)
    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-fundraiser');
    }

    // 4. Calculations
    const baseDonation = parseFloat(grand_total) || 0;
    if (baseDonation <= 0) throw new Error("Invalid donation amount");
    if (!account_id) throw new Error("Missing school account ID");

    // "Cover Fees" Logic: Ensuring school gets full base amount
    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');
    const amountToCharge = donorSaidYes ? (baseDonation + 0.30) / (1 - 0.029) : baseDonation;
    
    // NEW MATH: 5% Platform Fee (converted to cents)
    const yourFeeCents = Math.round((baseDonation * 0.05) * 100);

    // 5. Create Stripe Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amountToCharge * 100),
          product_data: { 
            name: 'Fundraising Donation',
            description: donorSaidYes ? 'Processing fees included' : 'Standard Donation'
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: yourFeeCents, // Now taking 5%
        transfer_data: { destination: account_id }, 
      },
      success_url: 'https://www.tradecrafteducation.com/pages/success-fundraiser',
      cancel_url: 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error',
    });

    res.redirect(303, session.url);

  } catch (err) {
    console.error("FUNDRAISING BRIDGE ERROR:", err.message);
    res.redirect(303, 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error');
  }
}
