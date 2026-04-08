const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Grab your Jotform field Unique Names
    const { grand_total, show_slug } = req.body;

    // 2. The 3.5% TradeCraft Math
    // 'grand_total' is the $103.30 the donor sees.
    const finalAmountCents = Math.round(parseFloat(grand_total) * 100);
    
    // We calculate your 3.5% fee based on the donation BEFORE the 3.3% bank fee.
    // Logic: $103.30 / 1.033 = $100 (The Intended Donation).
    const intendedDonation = parseFloat(grand_total) / 1.033; 
    
    // Your new fee is 3.5% of that $100.
    const yourFeeCents = Math.round((intendedDonation * 0.035) * 100);

    // 3. Create the Stripe Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: finalAmountCents,
          product_data: { name: 'Fundraiser Donation' },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: yourFeeCents,
        transfer_data: {
          destination: show_slug, // The school's acct_... ID
        },
      },
      success_url: 'https://tradecraftfundraising.com/success',
      cancel_url: 'https://tradecraftfundraising.com/cancel',
    });

    // 4. Redirect the donor to the auto-populated Stripe page
    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Check your Stripe Secret Key and Jotform Field Names' });
  }
}
