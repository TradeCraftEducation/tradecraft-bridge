const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    let body = typeof req.body === 'string' ? querystring.parse(req.body) : req.body;
    const { grand_total, account_id, cover_fees, typeA } = body;

    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-show');
    }

    const baseDonation = parseFloat(grand_total) || 0;
    if (baseDonation <= 0 || !account_id) throw new Error("Invalid Input");

    // 1. Calculate what the donor is actually paying
    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');
    const amountToCharge = donorSaidYes ? (baseDonation + 0.30) / (1 - 0.029) : baseDonation;
    const totalCents = Math.round(amountToCharge * 100);

    // 2. SAFETY MATH: Calculate Stripe's fee that WILL be billed to you
    // Stripe charges 2.9% + 30 cents
    const stripeProcessingFeeCents = Math.round((totalCents * 0.029) + 30);
    
    // 3. Your Profit: 3.5% of the base donation
    const tradecraftProfitCents = Math.round((baseDonation * 0.035) * 100);

    // 4. THE TOTAL FEE: You pull BOTH from the school
    // This covers your cost (Stripe) and keeps your profit
    const totalApplicationFeeCents = stripeProcessingFeeCents + tradecraftProfitCents;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: { 
            name: 'Show Solutions Add-on',
            description: donorSaidYes ? 'Processing fees included' : 'Standard Payment'
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: totalApplicationFeeCents,
        transfer_data: { destination: account_id },
      },
      success_url: 'https://www.tradecrafteducation.com/pages/success-show',
      cancel_url: 'https://www.tradecrafteducation.com/pages/show-solutions-error',
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error("BRIDGE ERROR:", err.message);
    res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
  }
}
